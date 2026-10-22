package com.vigienc.app

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs

/**
 * Bulle flottante par-dessus les autres applis (musique, GPS) : un point de
 * couleur et le prochain danger. On la déplace du doigt ; un appui ouvre
 * Vigie NC. Android Go refuse cette permission : la notification suffit.
 */
class Bulle(private val ctx: Context) {

    companion object {
        fun estAndroidGo(ctx: Context): Boolean =
            (ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).isLowRamDevice

        fun peutAfficher(ctx: Context): Boolean =
            !estAndroidGo(ctx) && Settings.canDrawOverlays(ctx)

        const val VERT = 0xFF2BB673.toInt()
        const val ORANGE = 0xFFF0912E.toInt()
        const val ROUGE = 0xFFE5484D.toInt()
    }

    private val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private var vue: LinearLayout? = null
    private var pastille: View? = null
    private var texte: TextView? = null
    private var params: WindowManager.LayoutParams? = null

    private fun dp(v: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.resources.displayMetrics).toInt()

    @SuppressLint("ClickableViewAccessibility")
    fun afficher() {
        if (vue != null) return
        val fond = GradientDrawable().apply {
            cornerRadius = dp(28f).toFloat()
            setColor(0xEE0E1C21.toInt())
            setStroke(dp(1f), 0xFF1E363D.toInt())
        }
        val rond = View(ctx).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(VERT)
            }
        }
        val label = TextView(ctx).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            text = "Vigie NC"
            maxLines = 1
        }
        val conteneur = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = fond
            setPadding(dp(12f), dp(10f), dp(16f), dp(10f))
            addView(rond, LinearLayout.LayoutParams(dp(14f), dp(14f)).apply { marginEnd = dp(10f) })
            addView(label)
            contentDescription = "Vigie NC, mode conduite"
        }
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dp(12f)
            y = dp(160f)
        }

        // Glisser pour déplacer, toucher pour ouvrir l'appli.
        var departX = 0
        var departY = 0
        var toucheX = 0f
        var toucheY = 0f
        var deplace = false
        conteneur.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    departX = lp.x; departY = lp.y
                    toucheX = e.rawX; toucheY = e.rawY
                    deplace = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - toucheX
                    val dy = e.rawY - toucheY
                    if (abs(dx) > dp(6f) || abs(dy) > dp(6f)) deplace = true
                    if (deplace) {
                        lp.x = departX + dx.toInt()
                        lp.y = departY + dy.toInt()
                        try { wm.updateViewLayout(conteneur, lp) } catch (_: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!deplace) ouvrirAppli()
                    true
                }
                else -> false
            }
        }

        try {
            wm.addView(conteneur, lp)
            vue = conteneur
            pastille = rond
            texte = label
            params = lp
        } catch (_: Exception) {
            // Permission retirée entre-temps : pas de bulle, la notification reste.
        }
    }

    fun maj(message: String, couleur: Int) {
        texte?.text = message
        (pastille?.background as? GradientDrawable)?.setColor(couleur)
    }

    fun retirer() {
        vue?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        vue = null
    }

    private fun ouvrirAppli() {
        val i = Intent(ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        try { ctx.startActivity(i) } catch (_: Exception) {}
    }
}
