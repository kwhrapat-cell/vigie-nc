package com.vigienc.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

/**
 * Démarrage tout seul en voiture : le téléphone signale (reconnaissance
 * d'activité de Google, très économe en batterie) quand on entre ou sort
 * d'un véhicule. Entrée → mode conduite ; sortie → arrêt, seulement s'il
 * avait démarré tout seul. Rien n'est envoyé ailleurs que sur le téléphone.
 */
object Auto {
    private const val ACTION_TRANSITION = "com.vigienc.app.TRANSITION"

    fun aLesPermissions(ctx: Context): Boolean {
        val position = ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val fond = Build.VERSION.SDK_INT < 29 ||
            ctx.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
        val activite = Build.VERSION.SDK_INT < 29 ||
            ctx.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
        return position && fond && activite
    }

    private fun intentionEnAttente(ctx: Context): PendingIntent {
        val i = Intent(ctx, TransitionReceiver::class.java).setAction(ACTION_TRANSITION)
        // Google ajoute le résultat dans l'intention : elle doit rester modifiable.
        val drapeaux = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
        return PendingIntent.getBroadcast(ctx, 7, i, drapeaux)
    }

    /** Inscrit la détection « en voiture ». Sans danger si déjà inscrite. */
    @SuppressLint("MissingPermission")
    fun activer(ctx: Context) {
        if (!aLesPermissions(ctx)) return
        val transitions = listOf(
            ActivityTransition.Builder()
                .setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                .build(),
            ActivityTransition.Builder()
                .setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
                .build(),
        )
        try {
            ActivityRecognition.getClient(ctx)
                .requestActivityTransitionUpdates(ActivityTransitionRequest(transitions), intentionEnAttente(ctx))
        } catch (_: Exception) {
            // Services Google absents ou permission retirée : pas de démarrage tout seul.
        }
    }

    @SuppressLint("MissingPermission")
    fun desactiver(ctx: Context) {
        try {
            ActivityRecognition.getClient(ctx).removeActivityTransitionUpdates(intentionEnAttente(ctx))
        } catch (_: Exception) {}
    }
}

/** Reçoit « entrée / sortie de véhicule » de la reconnaissance d'activité. */
class TransitionReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (!ActivityTransitionResult.hasResult(intent)) return
        val resultat = ActivityTransitionResult.extractResult(intent) ?: return
        val dernier = resultat.transitionEvents.lastOrNull { it.activityType == DetectedActivity.IN_VEHICLE } ?: return
        if (!Prefs.auto(ctx)) return
        try {
            if (dernier.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER) {
                ConduiteService.demarrerAuto(ctx)
            } else {
                ConduiteService.arreterAuto(ctx)
            }
        } catch (_: Exception) {
            // Android a refusé le démarrage en arrière-plan : on ne peut rien y faire ici.
        }
    }
}

/** Après un redémarrage du téléphone ou une mise à jour de l'appli : réinscription. */
class DemarrageReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (Prefs.auto(ctx)) Auto.activer(ctx)
    }
}
