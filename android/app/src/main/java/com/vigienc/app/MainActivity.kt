package com.vigienc.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.webkit.GeolocationPermissions
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Appli Android de TEST : le site vigie-nc.com dans l'appli, plus une barre
 * « Mode conduite » qui lance le service en arrière-plan (voix, notification,
 * bulle). Le site ne change pas : c'est le même, chargé depuis Internet.
 */
class MainActivity : Activity() {

    companion object {
        const val EXTRA_CHEMIN = "chemin"
        private const val REQ_CONDUITE = 10
        private const val REQ_GEO_SITE = 11
        private const val REQ_FICHIER = 12
        private const val REQ_AUTO_1 = 13
        private const val REQ_AUTO_2 = 14
        private const val FOND = 0xFF081317.toInt()
        private const val PANNEAU = 0xFF0E1C21.toInt()
        private const val PRIMAIRE = 0xFF1C9890.toInt()
        private const val TEXTE = 0xFFEAF6F4.toInt()
        private const val TEXTE_DOUX = 0xFF93B0AD.toInt()
    }

    private lateinit var web: WebView
    private lateinit var titre: TextView
    private lateinit var sousTitre: TextView
    private lateinit var bouton: Button
    private val handler = Handler(Looper.getMainLooper())
    private var geoOrigine: String? = null
    private var geoCallback: GeolocationPermissions.Callback? = null
    private var fichierCallback: ValueCallback<Array<Uri>>? = null

    private val rafraichir = object : Runnable {
        override fun run() {
            majBarre()
            handler.postDelayed(this, 1_000)
        }
    }

    private fun dp(v: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // --- Barre du mode conduite (au-dessus du site) ---
        titre = TextView(this).apply {
            setTextColor(TEXTE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setTypeface(typeface, Typeface.BOLD)
            maxLines = 1
        }
        sousTitre = TextView(this).apply {
            setTextColor(TEXTE_DOUX)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            maxLines = 2
        }
        val textes = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(titre)
            addView(sousTitre)
        }
        bouton = Button(this).apply {
            isAllCaps = false
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            minHeight = dp(44f)
            background = GradientDrawable().apply {
                cornerRadius = dp(22f).toFloat()
                setColor(PRIMAIRE)
            }
            setPadding(dp(18f), 0, dp(18f), 0)
            setOnClickListener { basculerConduite() }
        }
        val reglages = Button(this).apply {
            isAllCaps = false
            text = "Réglages"
            setTextColor(TEXTE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            minHeight = dp(44f)
            minWidth = 0
            minimumWidth = 0
            background = GradientDrawable().apply {
                cornerRadius = dp(22f).toFloat()
                setColor(PANNEAU)
                setStroke(dp(1f), 0xFF1E363D.toInt())
            }
            setPadding(dp(12f), 0, dp(12f), 0)
            contentDescription = "Réglages du mode conduite"
            setOnClickListener { ouvrirReglages() }
        }
        val barre = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(PANNEAU)
            setPadding(dp(14f), dp(8f), dp(10f), dp(8f))
            addView(textes, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(reglages, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(44f)).apply {
                marginStart = dp(8f)
            })
            addView(bouton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(44f)).apply {
                marginStart = dp(8f)
            })
        }

        // --- Le site ---
        web = WebView(this)
        web.setBackgroundColor(FOND)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            setGeolocationEnabled(true)
            // Le site cache son propre bouton « mode conduite » dans l'appli :
            // c'est cette barre native qui s'en charge.
            userAgentString = "$userAgentString VigieNCApp/${BuildConfig.VERSION_NAME}"
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                val hote = url.host ?: ""
                val site = Uri.parse(BuildConfig.SITE_URL).host ?: ""
                val interne = (url.scheme == "https" || url.scheme == "http") &&
                    (hote == site || hote.endsWith(".$site"))
                if (interne) return false
                // SMS du SOS, appels, WhatsApp, liens externes : applis du téléphone.
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                } catch (_: ActivityNotFoundException) {
                    true
                }
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                if (aLaPosition()) {
                    callback.invoke(origin, true, false)
                } else {
                    geoOrigine = origin
                    geoCallback = callback
                    requestPermissions(
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                        REQ_GEO_SITE,
                    )
                }
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fichierCallback?.onReceiveValue(emptyArray())
                fichierCallback = callback
                return try {
                    startActivityForResult(params.createIntent(), REQ_FICHIER)
                    true
                } catch (_: Exception) {
                    fichierCallback = null
                    false
                }
            }
        }

        val racine = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(FOND)
            addView(barre, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            addView(web, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        }
        // Android 15 dessine sous les barres du système : on laisse la place.
        ViewCompat.setOnApplyWindowInsetsListener(racine) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(racine)

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            web.loadUrl(adresse(intent))
        }
        // Démarrage tout seul déjà choisi : on (ré)inscrit la détection.
        if (Prefs.auto(this)) Auto.activer(this)
        majBarre()
    }

    private fun adresse(i: Intent?): String {
        val chemin = i?.getStringExtra(EXTRA_CHEMIN)
        return if (chemin.isNullOrBlank()) BuildConfig.SITE_URL else BuildConfig.SITE_URL + chemin
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (!intent.getStringExtra(EXTRA_CHEMIN).isNullOrBlank()) web.loadUrl(adresse(intent))
    }

    override fun onResume() {
        super.onResume()
        handler.post(rafraichir)
    }

    override fun onPause() {
        handler.removeCallbacks(rafraichir)
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("Retour arrière classique, suffisant pour l'appli de test")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    @Deprecated("API Activity simple, suffisante ici")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FICHIER) {
            fichierCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data) ?: emptyArray())
            fichierCallback = null
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    // --- Mode conduite ----------------------------------------------------

    private fun majBarre() {
        if (ConduiteService.actif) {
            titre.text = "Mode conduite actif"
            sousTitre.text = ConduiteService.statut.ifBlank { "Annonces vocales des dangers confirmés devant toi" }
            bouton.text = "Arrêter"
        } else {
            titre.text = "Mode conduite"
            sousTitre.text = if (Prefs.auto(this)) {
                "Démarre tout seul en voiture · voix jusqu'à ${Prefs.portee(this)} km"
            } else {
                "Voix jusqu'à ${Prefs.portee(this)} km devant toi, même écran éteint"
            }
            bouton.text = "Démarrer"
        }
    }

    private fun aLaPosition(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun basculerConduite() {
        if (ConduiteService.actif) {
            ConduiteService.arreter(this)
            handler.postDelayed({ majBarre() }, 300)
            return
        }
        val manquantes = ArrayList<String>()
        if (!aLaPosition()) {
            manquantes += Manifest.permission.ACCESS_FINE_LOCATION
            manquantes += Manifest.permission.ACCESS_COARSE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            manquantes += Manifest.permission.POST_NOTIFICATIONS
        }
        if (manquantes.isNotEmpty()) {
            requestPermissions(manquantes.toTypedArray(), REQ_CONDUITE)
        } else {
            proposerBulleEtDemarrer()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            REQ_CONDUITE -> {
                if (aLaPosition()) {
                    proposerBulleEtDemarrer()
                } else {
                    Toast.makeText(this, "Sans ta position, le mode conduite ne peut pas te prévenir.", Toast.LENGTH_LONG).show()
                }
            }
            REQ_GEO_SITE -> {
                geoCallback?.invoke(geoOrigine, aLaPosition(), false)
                geoCallback = null
                geoOrigine = null
            }
            REQ_AUTO_1 -> etapeAutoFond()
            REQ_AUTO_2 -> terminerAuto()
        }
    }

    // --- Réglages ---------------------------------------------------------

    private fun texte(t: String, tailleSp: Float, couleur: Int = TEXTE): TextView = TextView(this).apply {
        text = t
        setTextColor(couleur)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, tailleSp)
    }

    private fun ouvrirReglages() {
        val contenu = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22f), dp(12f), dp(22f), dp(4f))
        }

        contenu.addView(texte("Portée de la voix", 15f))
        contenu.addView(texte("Première annonce à cette distance, puis à 500 m (et à 3 km pour 10 km).", 12f, TEXTE_DOUX))
        val groupe = RadioGroup(this).apply { orientation = RadioGroup.HORIZONTAL }
        for (km in Conduite.PORTEES_KM) {
            groupe.addView(RadioButton(this).apply {
                id = 1000 + km
                text = "$km km"
                setTextColor(TEXTE)
                isChecked = Prefs.portee(this@MainActivity) == km
                minHeight = dp(44f)
                setPadding(dp(4f), 0, dp(16f), 0)
            })
        }
        groupe.setOnCheckedChangeListener { _, id -> Prefs.setPortee(this, id - 1000); majBarre() }
        contenu.addView(groupe)

        fun interrupteur(libelle: String, actif: Boolean, aide: String?, quand: (Boolean) -> Unit): Switch {
            val sw = Switch(this).apply {
                text = libelle
                setTextColor(TEXTE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
                isChecked = actif
                minHeight = dp(48f)
                setOnCheckedChangeListener { _, v -> quand(v) }
            }
            contenu.addView(sw, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(10f)
            })
            if (aide != null) contenu.addView(texte(aide, 12f, TEXTE_DOUX))
            return sw
        }

        interrupteur("Voix", Prefs.voix(this), null) { Prefs.setVoix(this, it) }
        interrupteur("Annoncer le trafic dense", Prefs.trafic(this), null) { Prefs.setTrafic(this, it) }

        var dialogue: AlertDialog? = null
        interrupteur(
            "Démarrer tout seul en voiture",
            Prefs.auto(this),
            "Le téléphone détecte quand tu roules en voiture : le mode conduite démarre et s'arrête tout seul, " +
                "même appli fermée. Il faut autoriser la position « Toujours » et l'activité physique. " +
                "En bus ou en taxi aussi : coupe ce réglage si ça te gêne.",
        ) { v ->
            if (v) {
                dialogue?.dismiss()
                activerAuto()
            } else {
                Prefs.setAuto(this, false)
                Auto.desactiver(this)
                majBarre()
            }
        }

        val defilement = ScrollView(this).apply { addView(contenu) }
        dialogue = AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Réglages du mode conduite")
            .setView(defilement)
            .setPositiveButton("OK", null)
            .show()
    }

    // --- Démarrage tout seul : permissions, une étape après l'autre --------

    private fun activerAuto() {
        val manquantes = ArrayList<String>()
        if (!aLaPosition()) {
            manquantes += Manifest.permission.ACCESS_FINE_LOCATION
            manquantes += Manifest.permission.ACCESS_COARSE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= 29 &&
            checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
        ) {
            manquantes += Manifest.permission.ACTIVITY_RECOGNITION
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            manquantes += Manifest.permission.POST_NOTIFICATIONS
        }
        if (manquantes.isNotEmpty()) requestPermissions(manquantes.toTypedArray(), REQ_AUTO_1) else etapeAutoFond()
    }

    /** « Toujours autoriser » se demande à part, après la position normale. */
    private fun etapeAutoFond() {
        if (!aLaPosition()) {
            refuserAuto("Sans ta position, le mode conduite ne peut pas te prévenir.")
            return
        }
        if (Build.VERSION.SDK_INT >= 29 &&
            checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
        ) {
            refuserAuto("Sans « Activité physique », l'appli ne sait pas quand tu es en voiture.")
            return
        }
        if (Build.VERSION.SDK_INT >= 29 &&
            checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle("Position : « Toujours autoriser »")
                .setMessage(
                    "Pour démarrer tout seul quand l'appli est fermée, Android demande la position « Toujours ». " +
                        "Ta position reste sur le téléphone : elle sert seulement à chercher les dangers autour, " +
                        "comme sur la carte. Sur l'écran suivant, choisis « Toujours autoriser ».",
                )
                .setPositiveButton("Continuer") { _, _ ->
                    requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), REQ_AUTO_2)
                }
                .setNegativeButton("Annuler") { _, _ -> refuserAuto(null) }
                .show()
            return
        }
        terminerAuto()
    }

    private fun terminerAuto() {
        if (!Auto.aLesPermissions(this)) {
            refuserAuto("Sans la position « Toujours », l'appli ne peut pas démarrer toute seule.")
            return
        }
        Prefs.setAuto(this, true)
        Auto.activer(this)
        majBarre()
        Toast.makeText(this, "C'est prêt : le mode conduite démarrera tout seul en voiture.", Toast.LENGTH_LONG).show()
        conseilXiaomi()
    }

    private fun refuserAuto(message: String?) {
        Prefs.setAuto(this, false)
        Auto.desactiver(this)
        majBarre()
        if (message != null) Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    /** Xiaomi, Redmi, Poco : MIUI coupe les applis en arrière-plan si on ne l'autorise pas. */
    private fun conseilXiaomi() {
        val marque = Build.MANUFACTURER.lowercase()
        if (marque !in setOf("xiaomi", "redmi", "poco")) return
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Réglage Xiaomi à faire une fois")
            .setMessage(
                "Sur ce téléphone, autorise le « Démarrage automatique » de Vigie NC, et mets son économiseur " +
                    "de batterie sur « Pas de restrictions ». Sinon le téléphone peut couper l'appli.",
            )
            .setPositiveButton("Ouvrir les réglages") { _, _ -> ouvrirReglagesXiaomi() }
            .setNegativeButton("Plus tard", null)
            .show()
    }

    private fun ouvrirReglagesXiaomi() {
        val demarrageAuto = Intent().setComponent(
            ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        )
        try {
            startActivity(demarrageAuto)
        } catch (_: Exception) {
            try {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            } catch (_: Exception) {}
        }
    }

    /** Première fois : propose la bulle (sauf sur Android Go, qui l'interdit). */
    private fun proposerBulleEtDemarrer() {
        val peutDemander = !Bulle.estAndroidGo(this) && !Settings.canDrawOverlays(this) && !Prefs.bulleDemandee(this)
        if (!peutDemander) {
            lancer()
            return
        }
        Prefs.setBulleDemandee(this)
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Afficher la bulle Vigie NC ?")
            .setMessage(
                "La bulle reste par-dessus tes autres applis (musique, GPS) et montre le prochain danger. " +
                    "Il faut autoriser « Afficher par-dessus les autres applis ». " +
                    "Après l'avoir autorisé, reviens ici et touche Démarrer.",
            )
            .setPositiveButton("Autoriser") { _, _ ->
                try {
                    startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                } catch (_: Exception) {
                    lancer()
                }
            }
            .setNegativeButton("Plus tard") { _, _ -> lancer() }
            .show()
    }

    private fun lancer() {
        try {
            ConduiteService.demarrer(this)
        } catch (_: Exception) {
            Toast.makeText(this, "Le mode conduite n'a pas pu démarrer.", Toast.LENGTH_LONG).show()
        }
        handler.postDelayed({ majBarre() }, 300)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        web.destroy()
        super.onDestroy()
    }
}
