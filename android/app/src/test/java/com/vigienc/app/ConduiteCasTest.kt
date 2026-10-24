package com.vigienc.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * Cas communs avec le site : vigie-nc/tests/cas-conduite.json, joués aussi
 * par vigie-nc/tests/conduite.test.ts. Si ce test casse, l'appli et le site
 * n'annoncent plus la même chose (Conduite.kt et lib/conduite.ts).
 */
class ConduiteCasTest {

    private val donnees: JSONObject by lazy {
        val chemin = "vigie-nc/tests/cas-conduite.json"
        val fichier = generateSequence(File(System.getProperty("user.dir")).absoluteFile) { it.parentFile }
            .map { File(it, chemin) }
            .firstOrNull { it.exists() }
            ?: error("$chemin introuvable")
        JSONObject(fichier.readText())
    }

    private val departLat = -22.27
    private val departLng = 166.58

    /** Même décalage que offsetKm() de lib/geo.ts. */
    private fun decale(nordM: Double, estM: Double): Pair<Double, Double> = Pair(
        departLat + nordM / 1000 / 111.32,
        departLng + estM / 1000 / (111.32 * Math.cos(Math.toRadians(departLat))),
    )

    @Test
    fun casCommuns() {
        val liste = donnees.getJSONArray("cas")
        val maintenant = System.currentTimeMillis()
        for (i in 0 until liste.length()) {
            val c = liste.getJSONObject(i)
            val portee = c.getInt("portee")
            val trafic = c.getBoolean("trafic")
            val cap = if (c.isNull("cap")) null else c.getDouble("cap")
            val js = c.getJSONArray("signalements")
            val signalements = (0 until js.length()).map { k ->
                val s = js.getJSONObject(k)
                val (lat, lng) = decale(s.getDouble("nordM"), s.getDouble("estM"))
                Signalement(
                    id = s.getString("id"),
                    type = s.getString("type"),
                    lat = lat,
                    lng = lng,
                    confirmations = s.getInt("confirmations"),
                    sourceOfficielle = if (s.has("source")) s.getString("source") else null,
                    expireLeMs = maintenant + s.optInt("expireDansMin", 60) * 60_000L,
                    actif = true,
                    lieu = null,
                    relaisSource = null,
                )
            }
            val pasM = c.getDouble("pasM")
            val pas = if (pasM > 0) (c.getDouble("distanceM") / pasM).toInt() else 0
            val deja = HashMap<String, Double>()
            val obtenues = ArrayList<String>()
            for (n in 0..pas) {
                val (lat, lng) = decale(n * pasM, 0.0)
                val devant = Conduite.dangersDevant(lat, lng, cap, signalements, trafic, portee, maintenant)
                for (d in Conduite.aAnnoncer(devant, deja, portee)) {
                    obtenues.add("${d.signalement.id}@${deja[d.signalement.id]!!.toInt()}")
                }
            }
            val ja = c.getJSONArray("annonces")
            val attendues = (0 until ja.length()).map { k ->
                val a = ja.getJSONArray(k)
                "${a.getString(0)}@${a.getInt(1)}"
            }
            assertEquals(c.getString("nom"), attendues, obtenues)
        }
    }

    @Test
    fun distancesParlees() {
        val liste = donnees.getJSONArray("distancesParlees")
        for (i in 0 until liste.length()) {
            val d = liste.getJSONArray(i)
            assertEquals("${d.getDouble(0)} m", d.getString(1), Conduite.distanceParlee(d.getDouble(0)))
        }
    }
}
