package com.vigienc.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Mode conduite en arrière-plan : service « au premier plan » (notification
 * permanente obligatoire), démarré depuis l'appli ouverte. Il suit la
 * position, cherche les signalements autour, annonce à voix haute les
 * dangers confirmés devant (en baissant la musique) et met à jour la
 * notification et la bulle. Le calcul « devant moi » se fait ici, sur le
 * téléphone : la position ne sert qu'à la recherche, comme sur la carte.
 */
class ConduiteService : Service(), LocationListener, TextToSpeech.OnInitListener {

    companion object {
        const val ACTION_DEMARRER = "com.vigienc.app.DEMARRER"
        const val ACTION_ARRETER = "com.vigienc.app.ARRETER"
        // Démarrage / arrêt décidés par la détection « en voiture ».
        const val ACTION_DEMARRER_AUTO = "com.vigienc.app.DEMARRER_AUTO"
        const val ACTION_ARRETER_AUTO = "com.vigienc.app.ARRETER_AUTO"
        private const val CANAL = "conduite"
        private const val NOTIF_ID = 42
        // Démarré tout seul : arrêt si l'on ne bouge plus pendant ce temps
        // (au cas où la sortie de voiture n'aurait pas été détectée).
        private const val ARRET_IMMOBILE_MS = 15 * 60_000L

        // Dangers déjà annoncés, gardés 30 min après l'arrêt : un arrêt puis
        // un redémarrage en route (détection « en voiture » qui hésite, arrêt
        // à un feu…) ne fait pas tout réannoncer.
        private val dejaMemoire = HashMap<String, Double>()
        private var arretMs = 0L

        /** Lu par l'écran de l'appli (barre du mode conduite). */
        @Volatile var actif = false
            private set
        @Volatile var statut = ""
            private set
        @Volatile var demarreAuto = false
            private set

        fun demarrer(ctx: Context) {
            val i = Intent(ctx, ConduiteService::class.java).setAction(ACTION_DEMARRER)
            androidx.core.content.ContextCompat.startForegroundService(ctx, i)
        }

        fun arreter(ctx: Context) {
            ctx.startService(Intent(ctx, ConduiteService::class.java).setAction(ACTION_ARRETER))
        }

        /** Appelé quand le téléphone détecte qu'on monte en voiture. */
        fun demarrerAuto(ctx: Context) {
            val i = Intent(ctx, ConduiteService::class.java).setAction(ACTION_DEMARRER_AUTO)
            androidx.core.content.ContextCompat.startForegroundService(ctx, i)
        }

        /** Appelé à la sortie de voiture : n'arrête que ce qui a démarré tout seul. */
        fun arreterAuto(ctx: Context) {
            if (!actif || !demarreAuto) return
            ctx.startService(Intent(ctx, ConduiteService::class.java).setAction(ACTION_ARRETER_AUTO))
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private val reseau = Executors.newSingleThreadExecutor()
    private lateinit var lm: LocationManager
    private lateinit var audio: AudioManager
    private var tts: TextToSpeech? = null
    private var ttsPret = false
    private var focus: AudioFocusRequest? = null

    private var position: Location? = null
    private var dernierGpsMs = 0L
    private var precedent: Location? = null
    private var cap: Double? = null
    private var signalements: List<Signalement> = emptyList()
    private var rechercheLat = 0.0
    private var rechercheLng = 0.0
    private var rechercheMs = 0L
    private var rechercheEnCours = false
    private var horsReseau = false
    private var porteeRecherche = 0
    private var dernierMouvementMs = 0L
    private var lieuMouvement: Location? = null
    private val deja = dejaMemoire
    // Relancé moins de 30 min après un arrêt : pas de phrase d'accueil en démarrage tout seul.
    private var relanceRecente = false
    private var bulle: Bulle? = null

    private val attributsVoix = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()

    private val minuteur = object : Runnable {
        override fun run() {
            if (demarreAuto && System.currentTimeMillis() - dernierMouvementMs > ARRET_IMMOBILE_MS) {
                arreterTout()
                return
            }
            val pos = position
            if (pos != null && System.currentTimeMillis() - rechercheMs >= Conduite.RELANCE_MS) {
                chercher(pos.latitude, pos.longitude)
            }
            evaluer()
            main.postDelayed(this, 15_000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CANAL, "Mode conduite", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Le prochain danger devant toi, pendant le mode conduite"
                setShowBadge(false)
            },
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_ARRETER -> {
                arreterTout()
                return START_NOT_STICKY
            }
            ACTION_ARRETER_AUTO -> {
                if (!actif || demarreAuto) arreterTout()
                return START_NOT_STICKY
            }
        }
        val auto = intent?.action == ACTION_DEMARRER_AUTO
        if (actif) {
            // Déjà en route : Android exige quand même la notification.
            premierPlan(titreActuel, texteActuel)
            if (!auto) demarreAuto = false // lancé à la main : plus d'arrêt automatique
        } else {
            demarrerTout(auto)
        }
        return START_NOT_STICKY
    }

    private var titreActuel = "Mode conduite"
    private var texteActuel = "Recherche de ta position…"

    private fun premierPlan(titre: String, texte: String): Boolean {
        val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
        return try {
            ServiceCompat.startForeground(this, NOTIF_ID, notification(titre, texte), type)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun demarrerTout(auto: Boolean) {
        statut = "Recherche de ta position…"
        titreActuel = if (auto) "Mode conduite (démarré tout seul)" else "Mode conduite"
        texteActuel = statut
        if (!premierPlan(titreActuel, texteActuel)) {
            // Position refusée (ou pas « toujours » pour un démarrage tout seul).
            stopSelf()
            return
        }
        actif = true
        demarreAuto = auto
        dernierMouvementMs = System.currentTimeMillis()
        lieuMouvement = null
        relanceRecente = arretMs > 0 && System.currentTimeMillis() - arretMs < Conduite.MEMOIRE_MS
        if (!relanceRecente) deja.clear()
        arretMs = 0L
        tts = TextToSpeech(this, this)
        try {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2_000L, 10f, this, Looper.getMainLooper())
        } catch (_: Exception) {}
        try {
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5_000L, 25f, this, Looper.getMainLooper())
            }
        } catch (_: Exception) {}
        if (Bulle.peutAfficher(this)) {
            bulle = Bulle(this).also { it.afficher(); it.maj("Recherche…", Bulle.VERT) }
        }
        main.postDelayed(minuteur, 15_000)
    }

    private fun arreterTout() {
        if (actif) arretMs = System.currentTimeMillis()
        actif = false
        demarreAuto = false
        statut = ""
        main.removeCallbacks(minuteur)
        try { lm.removeUpdates(this) } catch (_: Exception) {}
        tts?.stop()
        tts?.shutdown()
        tts = null
        ttsPret = false
        relacherFocus()
        bulle?.retirer()
        bulle = null
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        if (actif) arreterTout()
        reseau.shutdownNow()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // --- Voix -------------------------------------------------------------

    override fun onInit(etat: Int) {
        val t = tts ?: return
        if (etat != TextToSpeech.SUCCESS) return
        val r = t.setLanguage(Locale.FRANCE)
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) t.setLanguage(Locale.FRENCH)
        choisirVoix(t)
        // Un peu moins vite que la normale : plus clair en voiture (comme lib/voix.ts).
        t.setSpeechRate(0.95f)
        t.setAudioAttributes(attributsVoix)
        t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) { main.post { relacherFocus() } }
            @Deprecated("Ancienne API, encore appelée sur certains téléphones")
            override fun onError(id: String?) { main.post { relacherFocus() } }
        })
        ttsPret = true
        if (!(demarreAuto && relanceRecente)) {
            parler(
                if (demarreAuto) "Vigie NC : tu roules, je surveille la route devant toi."
                else "Mode conduite activé. Je te préviens des dangers confirmés devant toi, même écran éteint.",
            )
        }
    }

    /**
     * La voix française la plus naturelle installée sur le téléphone. On
     * écarte les voix qui ont besoin d'Internet (souvent coupé en voiture)
     * et celles pas encore téléchargées. Sinon, la voix par défaut reste.
     */
    private fun choisirVoix(t: TextToSpeech) {
        try {
            val meilleure = (t.voices ?: return)
                .filter { it.locale.language == "fr" }
                .filter { !it.isNetworkConnectionRequired }
                .filter { it.features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) != true }
                .maxByOrNull { it.quality + (if (it.locale.country == "FR") 50 else 0) }
                ?: return
            t.voice = meilleure
        } catch (e: Exception) {
            // Certains moteurs de voix refusent la liste : on garde la voix par défaut.
        }
    }

    private fun parler(texte: String) {
        val t = tts ?: return
        if (!ttsPret || !Prefs.voix(this)) return
        // La musique baisse le temps de l'annonce, comme avec un GPS.
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attributsVoix)
            .build()
        audio.requestAudioFocus(req)
        focus = req
        t.speak(texte, TextToSpeech.QUEUE_ADD, null, "vigie-${System.nanoTime()}")
    }

    private fun relacherFocus() {
        if (tts?.isSpeaking == true) return
        focus?.let { audio.abandonAudioFocusRequest(it) }
        focus = null
    }

    // --- Position ---------------------------------------------------------

    override fun onLocationChanged(loc: Location) {
        val maintenant = System.currentTimeMillis()
        if (loc.provider == LocationManager.GPS_PROVIDER) {
            dernierGpsMs = maintenant
        } else if (maintenant - dernierGpsMs < 10_000) {
            return // le GPS est plus précis : on garde sa position
        }

        val prec = precedent
        if (loc.hasBearing() && loc.hasSpeed() && loc.speed >= Conduite.VITESSE_CAP_MIN) {
            cap = loc.bearing.toDouble()
            precedent = loc
        } else if (loc.hasSpeed() && loc.speed < 1f) {
            cap = null // à l'arrêt : sens de marche incertain
        } else if (prec == null) {
            precedent = loc
        } else if (prec.distanceTo(loc) >= Conduite.DEPLACEMENT_CAP_M) {
            cap = Conduite.capDeg(prec.latitude, prec.longitude, loc.latitude, loc.longitude)
            precedent = loc
        }
        position = loc

        // On bouge encore ? (pour l'arrêt automatique)
        val ref = lieuMouvement
        if ((loc.hasSpeed() && loc.speed >= 3f) || ref == null || ref.distanceTo(loc) >= 150f) {
            dernierMouvementMs = maintenant
            lieuMouvement = loc
        }

        val d = if (rechercheMs == 0L) Double.MAX_VALUE
        else Conduite.distanceM(rechercheLat, rechercheLng, loc.latitude, loc.longitude)
        if (d >= Conduite.RELANCE_M || maintenant - rechercheMs >= Conduite.RELANCE_MS ||
            porteeRecherche != Prefs.portee(this)
        ) {
            chercher(loc.latitude, loc.longitude)
        }
        evaluer()
    }

    // Anciennes versions d'Android (8 et 9) : ces méthodes doivent exister.
    @Deprecated("Ancienne API")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}

    private fun chercher(lat: Double, lng: Double) {
        if (rechercheEnCours) return
        rechercheEnCours = true
        val portee = Prefs.portee(this)
        reseau.execute {
            try {
                val liste = Api.signalementsProches(lat, lng, Conduite.rayonRecherche(portee))
                main.post {
                    // Oublie les signalements disparus de la recherche (pas
                    // avant la première : au redémarrage, la mémoire reste).
                    val ids = liste.mapTo(HashSet()) { it.id }
                    deja.keys.retainAll(ids)
                    signalements = liste
                    porteeRecherche = portee
                    rechercheLat = lat
                    rechercheLng = lng
                    rechercheMs = System.currentTimeMillis()
                    rechercheEnCours = false
                    horsReseau = false
                    evaluer()
                }
            } catch (_: Exception) {
                main.post {
                    rechercheEnCours = false
                    horsReseau = true
                    // On réessaiera au prochain point GPS ou au minuteur.
                    rechercheMs = System.currentTimeMillis() - Conduite.RELANCE_MS + 20_000
                    evaluer()
                }
            }
        }
    }

    // --- Décision et affichage --------------------------------------------

    private fun evaluer() {
        if (!actif) return
        val pos = position
        if (pos == null) {
            majAffichage("Mode conduite", "Recherche de ta position…", "Recherche…", Bulle.VERT)
            return
        }
        val maintenant = System.currentTimeMillis()
        val portee = Prefs.portee(this)
        val devant = Conduite.dangersDevant(
            pos.latitude, pos.longitude, cap, signalements, Prefs.trafic(this), portee, maintenant,
        )
        for (d in Conduite.aAnnoncer(devant, deja, portee).take(2)) parler(Conduite.texteAnnonce(d, cap != null))

        val prochain = devant.firstOrNull()
        if (prochain != null) {
            val nom = Conduite.nomAffiche(prochain.signalement.type)
            val ou = "${Conduite.distanceCourte(prochain.distanceM)}${if (cap != null) " devant" else " autour de toi"}"
            val lieu = prochain.signalement.lieu?.let { " · $it" } ?: ""
            val couleur = if (prochain.signalement.type == "trafic_dense") Bulle.ORANGE else Bulle.ROUGE
            majAffichage(
                "$nom à $ou",
                "${prochain.signalement.fiabilite()}$lieu",
                "$nom · ${Conduite.distanceCourte(prochain.distanceM)}",
                couleur,
            )
        } else {
            val detail = when {
                horsReseau -> "Pas de réseau : annonces en pause"
                cap == null -> "Je surveille 1 km autour de toi"
                else -> "Je surveille les $portee km devant toi"
            }
            majAffichage("Rien de confirmé devant toi", detail, "Rien devant", Bulle.VERT)
        }
    }

    private fun majAffichage(titre: String, texte: String, bulleTexte: String, couleur: Int) {
        statut = "$titre · $texte"
        titreActuel = titre
        texteActuel = texte
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        try { nm.notify(NOTIF_ID, notification(titre, texte)) } catch (_: Exception) {}
        bulle?.maj(bulleTexte, couleur)
    }

    private fun notification(titre: String, texte: String): Notification {
        val drapeaux = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        val ouvrir = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            drapeaux,
        )
        val signaler = PendingIntent.getActivity(
            this, 1,
            Intent(this, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_CHEMIN, "/signaler")
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            drapeaux,
        )
        val stop = PendingIntent.getService(
            this, 2,
            Intent(this, ConduiteService::class.java).setAction(ACTION_ARRETER),
            drapeaux,
        )
        return NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_stat_vigie)
            .setColor(0xFF22B8B0.toInt())
            .setContentTitle(titre)
            .setContentText(texte)
            .setStyle(NotificationCompat.BigTextStyle().bigText(texte))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(ouvrir)
            .addAction(0, "Signaler", signaler)
            .addAction(0, "Arrêter", stop)
            .build()
    }
}
