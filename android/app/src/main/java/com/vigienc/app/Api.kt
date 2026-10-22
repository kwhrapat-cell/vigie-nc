package com.vigienc.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.OffsetDateTime

/**
 * Lecture des signalements autour d'un point : la même RPC publique que la
 * carte du site (signalements_proches_v3). Rien d'autre n'est envoyé que
 * la position du moment et le rayon, comme sur le site.
 */
object Api {
    fun signalementsProches(lat: Double, lng: Double, rayonM: Int): List<Signalement> {
        val url = URL("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/signalements_proches_v3")
        val c = url.openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15_000
            c.readTimeout = 15_000
            c.doOutput = true
            c.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY)
            c.setRequestProperty("Content-Type", "application/json")
            c.setRequestProperty("Accept", "application/json")
            val corps = JSONObject()
                .put("p_lat", lat)
                .put("p_lng", lng)
                .put("p_rayon_m", rayonM)
                .toString()
            c.outputStream.use { it.write(corps.toByteArray(Charsets.UTF_8)) }
            val code = c.responseCode
            if (code !in 200..299) throw IOException("Réponse $code")
            val texte = c.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            return lire(JSONArray(texte))
        } finally {
            c.disconnect()
        }
    }

    private fun lire(tableau: JSONArray): List<Signalement> {
        val sortie = ArrayList<Signalement>(tableau.length())
        for (i in 0 until tableau.length()) {
            val o = tableau.optJSONObject(i) ?: continue
            try {
                sortie.add(
                    Signalement(
                        id = o.getString("id"),
                        type = o.getString("type"),
                        lat = o.getDouble("lat"),
                        lng = o.getDouble("lng"),
                        confirmations = o.optInt("confirmations", 0),
                        sourceOfficielle = texteOuNull(o, "source_officielle"),
                        expireLeMs = OffsetDateTime.parse(o.getString("expires_at")).toInstant().toEpochMilli(),
                        actif = if (o.isNull("actif")) true else o.optBoolean("actif", true),
                        lieu = texteOuNull(o, "lieu"),
                    ),
                )
            } catch (_: Exception) {
                // Ligne illisible : on l'ignore, les autres restent valables.
            }
        }
        return sortie
    }

    private fun texteOuNull(o: JSONObject, cle: String): String? =
        if (!o.has(cle) || o.isNull(cle)) null else o.getString(cle)
}

/** Réglages du mode conduite, gardés sur le téléphone. */
object Prefs {
    private fun p(ctx: Context) = ctx.getSharedPreferences("conduite", Context.MODE_PRIVATE)

    fun voix(ctx: Context) = p(ctx).getBoolean("voix", true)
    fun setVoix(ctx: Context, v: Boolean) = p(ctx).edit().putBoolean("voix", v).apply()

    fun trafic(ctx: Context) = p(ctx).getBoolean("trafic", false)
    fun setTrafic(ctx: Context, v: Boolean) = p(ctx).edit().putBoolean("trafic", v).apply()

    fun bulleDemandee(ctx: Context) = p(ctx).getBoolean("bulle_demandee", false)
    fun setBulleDemandee(ctx: Context) = p(ctx).edit().putBoolean("bulle_demandee", true).apply()
}
