plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Clé de signature de TEST : le fichier vigie-nc-test.p12 est dans le dépôt,
// chiffré (AES-256) par un mot de passe qui, lui, n'y est PAS : il vient du
// secret GitHub ANDROID_KEYSTORE_PASSWORD. Sans ce secret (PR d'un robot,
// ordinateur sans le secret), l'appli est signée avec la clé de débogage
// habituelle : elle se construit, mais n'est pas publiée (android.yml).
// Ne jamais l'utiliser pour le Play Store.
val motDePasseCle: String? = System.getenv("ANDROID_KEYSTORE_PASSWORD")?.takeIf { it.isNotBlank() }

android {
    namespace = "com.vigienc.app"
    // 36 : demandé par androidx.core 1.17 et plus (le comportement de l'appli
    // dépend de targetSdk, qui reste à 35).
    compileSdk = 36

    defaultConfig {
        applicationId = "com.vigienc.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0-test"

        // Adresse du site affiché dans l'appli.
        buildConfigField("String", "SITE_URL", "\"https://vigie-nc.com\"")
        // Base Supabase : adresse et clé PUBLIQUE (la même que celle que le
        // site envoie à chaque navigateur). Elle ne donne accès qu'aux RPC
        // ouvertes au public, comme signalements_proches_v3. Aucun secret ici.
        buildConfigField("String", "SUPABASE_URL", "\"https://erprhuqbodtsmvuknfrv.supabase.co\"")
        buildConfigField("String", "SUPABASE_KEY", "\"sb_publishable_4qPqI8roa5sE1RnHoNuLWQ_-uO_e51o\"")
    }

    // Toutes les versions de test ont la même signature : on les installe
    // par-dessus la précédente.
    signingConfigs {
        if (motDePasseCle != null) {
            create("test") {
                storeFile = file("vigie-nc-test.p12")
                storeType = "PKCS12"
                storePassword = motDePasseCle
                keyAlias = "vigie-nc"
                keyPassword = motDePasseCle
            }
        }
    }

    buildTypes {
        debug {
            if (motDePasseCle != null) signingConfig = signingConfigs.getByName("test")
        }
        release {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Kotlin 2.4 : « kotlinOptions » n'existe plus, on passe par compilerOptions.
kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    // 1.17 au plus tant que l'appli reste sur Android Gradle Plugin 8 :
    // androidx.core 1.19 demande AGP 9.1 et compileSdk 37.
    implementation("androidx.core:core-ktx:1.17.0")
    // Reconnaissance d'activité (démarrage tout seul en voiture).
    implementation("com.google.android.gms:play-services-location:21.4.0")

    // Tests (sur l'ordinateur de GitHub, pas dans l'appli) : cas communs
    // avec le site, voir src/test/…/ConduiteCasTest.kt.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
