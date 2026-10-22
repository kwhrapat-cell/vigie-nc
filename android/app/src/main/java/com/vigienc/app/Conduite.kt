package com.vigienc.app

import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** Un signalement tel que renvoyé par la RPC signalements_proches_v3. */
data class Signalement(
    val id: String,
    val type: String,
    val lat: Double,
    val lng: Double,
    val confirmations: Int,
    val sourceOfficielle: String?,
    val expireLeMs: Long,
    val actif: Boolean,
    val lieu: String?,
)

data class DangerDevant(val signalement: Signalement, val distanceM: Double)

/**
 * Mode conduite : quels dangers confirmés sont DEVANT le conducteur, et
 * quand les annoncer.
 *
 * ⚠️ Même logique que le site (vigie-nc/lib/conduite.ts) : garder les deux
 * alignées (paliers, angle, portées, règle « confirmé »).
 */
object Conduite {
    const val RAYON_RECHERCHE_M = 8_000
    const val RELANCE_M = 1_500.0
    const val RELANCE_MS = 90_000L
    const val ANGLE_DEVANT_DEG = 40.0
    const val PORTEE_M = 5_000.0
    val PALIERS_M = doubleArrayOf(3_000.0, 500.0)
    const val PORTEE_SANS_CAP_M = 1_000.0
    const val VITESSE_CAP_MIN = 2.5f
    const val DEPLACEMENT_CAP_M = 30f

    // Même liste que ALERT_TYPES (lib/types.ts) et vigie_est_danger() (SQL).
    private val TYPES_DANGER = setOf("accident", "route_coupee", "inondation", "feu", "danger", "meteo")

    private const val RAYON_TERRE_M = 6_371_008.8

    fun distanceM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val h = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2)
        return 2 * RAYON_TERRE_M * asin(sqrt(h))
    }

    /** Cap de (lat1, lng1) vers (lat2, lng2), en degrés (0 = nord). */
    fun capDeg(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val p1 = Math.toRadians(lat1)
        val p2 = Math.toRadians(lat2)
        val dl = Math.toRadians(lng2 - lng1)
        val y = sin(dl) * cos(p2)
        val x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
        return (Math.toDegrees(atan2(y, x)) + 360) % 360
    }

    fun ecartDeg(a: Double, b: Double): Double {
        val d = abs(a - b) % 360
        return if (d > 180) 360 - d else d
    }

    /** Même règle que les notifications : danger, confirmé par une 2e personne ou une source officielle. */
    fun estAnnoncable(s: Signalement, avecTrafic: Boolean, maintenant: Long): Boolean {
        val typeOk = s.type in TYPES_DANGER || (avecTrafic && s.type == "trafic_dense")
        if (!typeOk || !s.actif || s.expireLeMs <= maintenant) return false
        return s.confirmations >= 1 || !s.sourceOfficielle.isNullOrBlank()
    }

    fun dangersDevant(
        lat: Double,
        lng: Double,
        cap: Double?,
        liste: List<Signalement>,
        avecTrafic: Boolean,
        maintenant: Long,
    ): List<DangerDevant> {
        val sortie = ArrayList<DangerDevant>()
        for (s in liste) {
            if (!estAnnoncable(s, avecTrafic, maintenant)) continue
            val d = distanceM(lat, lng, s.lat, s.lng)
            if (cap == null) {
                if (d <= PORTEE_SANS_CAP_M) sortie.add(DangerDevant(s, d))
                continue
            }
            if (d > PORTEE_M) continue
            if (d < 150 || ecartDeg(cap, capDeg(lat, lng, s.lat, s.lng)) <= ANGLE_DEVANT_DEG) {
                sortie.add(DangerDevant(s, d))
            }
        }
        sortie.sortBy { it.distanceM }
        return sortie
    }

    fun palierPour(distance: Double): Double? {
        var palier: Double? = null
        for (p in PALIERS_M) if (distance <= p) palier = p
        return palier
    }

    /** Les dangers à annoncer maintenant (jamais deux fois le même palier). */
    fun aAnnoncer(devant: List<DangerDevant>, deja: MutableMap<String, Double>): List<DangerDevant> {
        val sortie = ArrayList<DangerDevant>()
        for (d in devant) {
            val palier = palierPour(d.distanceM) ?: continue
            val precedent = deja[d.signalement.id]
            if (precedent != null && precedent <= palier) continue
            deja[d.signalement.id] = palier
            sortie.add(d)
        }
        return sortie
    }

    private val NOMS_PARLES = mapOf(
        "accident" to "accident",
        "inondation" to "inondation",
        "feu" to "feu ou fumée",
        "route_coupee" to "route coupée",
        "danger" to "danger",
        "meteo" to "météo dangereuse",
        "trafic_dense" to "trafic dense",
    )

    private val NOMS_AFFICHES = mapOf(
        "accident" to "Accident",
        "inondation" to "Inondation",
        "feu" to "Feu ou fumée",
        "route_coupee" to "Route coupée",
        "danger" to "Danger",
        "meteo" to "Météo dangereuse",
        "trafic_dense" to "Trafic dense",
    )

    fun nomAffiche(type: String): String = NOMS_AFFICHES[type] ?: "Danger"

    fun distanceParlee(m: Double): String {
        if (m < 1000) {
            val arrondi = max(100, (m / 100).roundToInt() * 100)
            return if (arrondi >= 1000) "à 1 kilomètre" else "à $arrondi mètres"
        }
        val km = (m / 100).roundToInt() / 10.0
        if (km >= 10) return "à ${km.roundToInt()} kilomètres"
        val texte = if (km == km.toInt().toDouble()) km.toInt().toString() else km.toString().replace('.', ',')
        return "à $texte kilomètre${if (km >= 2) "s" else ""}"
    }

    /** « 2,8 km », « 500 m » : pour la notification et la bulle. */
    fun distanceCourte(m: Double): String {
        if (m < 1000) return "${max(100, (m / 100).roundToInt() * 100)} m"
        val km = (m / 100).roundToInt() / 10.0
        return if (km >= 10) "${km.roundToInt()} km" else "${km.toString().replace('.', ',')} km"
    }

    fun texteAnnonce(d: DangerDevant, avecCap: Boolean): String {
        val nom = NOMS_PARLES[d.signalement.type] ?: "danger"
        return "Attention, $nom ${distanceParlee(d.distanceM)}${if (avecCap) " devant" else ""}."
    }
}
