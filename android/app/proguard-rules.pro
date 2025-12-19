# Add project specific ProGuard rules here.

# ============================================================================
# CRITICAL: Keep generic signatures for Retrofit + Gson
# ============================================================================
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes Exceptions
-keepattributes EnclosingMethod
-keepattributes InnerClasses

# ============================================================================
# Retrofit
# ============================================================================
-keep class retrofit2.** { *; }
-keep interface retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}

# Keep Retrofit Response generic type info
-keepclassmembers,allowobfuscation class * {
    @retrofit2.http.* <methods>;
}

# Retrofit suspend function support (CRITICAL for Kotlin coroutines)
-if interface * { @retrofit2.http.* public *** *(...); }
-keep,allowobfuscation interface <1>
-keep,allowobfuscation,allowshrinking class retrofit2.Response

# ============================================================================
# OkHttp
# ============================================================================
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# ============================================================================
# Gson
# ============================================================================
-keep class com.google.gson.** { *; }
-keep class sun.misc.Unsafe { *; }

# Keep TypeToken and its subclasses (CRITICAL)
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken

# Keep generic type information for Gson
-keep class * extends com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# ============================================================================
# Kotlin Coroutines (CRITICAL for suspend functions)
# ============================================================================
-keepclassmembers class kotlin.coroutines.Continuation {
    *;
}
-keep class kotlin.coroutines.Continuation
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}

# ============================================================================
# Room
# ============================================================================
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-keep @androidx.room.Dao interface *

# ============================================================================
# App API classes - MUST keep everything for Gson/Retrofit
# ============================================================================
# Keep all network model classes with their generic signatures
-keep class app.stifle.network.** { *; }
-keepclassmembers class app.stifle.network.** {
    <fields>;
    <init>(...);
}

# Keep all data classes
-keep class app.stifle.data.** { *; }
-keepclassmembers class app.stifle.data.** {
    <fields>;
    <init>(...);
}

# ============================================================================
# Kotlin
# ============================================================================
-keep class kotlin.Metadata { *; }
-keepclassmembers class kotlin.Metadata {
    public <methods>;
}
-keepattributes RuntimeVisibleAnnotations

# ============================================================================
# Firebase
# ============================================================================
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**


