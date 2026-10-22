package com.vigienc.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
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
        val barre = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(PANNEAU)
            setPadding(dp(14f), dp(8f), dp(10f), dp(8f))
            addView(textes, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(bouton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(44f)).apply {
                marginStart = dp(10f)
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
            sousTitre.text = "Annonces vocales des dangers devant toi, même écran éteint"
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
