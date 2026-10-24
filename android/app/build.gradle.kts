plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.vigienc.app"
    compileSdk = 35

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

    // Clé de signature DE TEST, volontairement dans le dépôt : toutes les
    // versions de test ont la même signature, on peut donc les installer
    // par-dessus la précédente. Ne jamais l'utiliser pour le Play Store.
    signingConfigs {
        create("test") {
            storeFile = file("vigie-test.keystore")
            storePassword = "vigie-test"
            keyAlias = "vigie-test"
            keyPassword = "vigie-test"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("test")
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
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    // Reconnaissance d'activité (démarrage tout seul en voiture).
    implementation("com.google.android.gms:play-services-location:21.3.0")

    // Tests (sur l'ordinateur de GitHub, pas dans l'appli) : cas communs
    // avec le site, voir src/test/…/ConduiteCasTest.kt.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
