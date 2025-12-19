# Add project specific ProGuard rules here.

# ============================================================================
# Retrofit + OkHttp
# ============================================================================
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes Exceptions

-keep class retrofit2.** { *; }
-keep interface retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}

# OkHttp
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# ============================================================================
# Gson - Critical for type reflection
# ============================================================================
-keepattributes Signature
-keepattributes EnclosingMethod
-keepattributes InnerClasses

-keep class com.google.gson.** { *; }
-keep class sun.misc.Unsafe { *; }

# Keep generic type information for Gson
-keep class * extends com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Prevent stripping of generics on API response classes
-keep,allowobfuscation,allowshrinking class com.google.gson.reflect.TypeToken
-keep,allowobfuscation,allowshrinking class * extends com.google.gson.reflect.TypeToken

# ============================================================================
# Room
# ============================================================================
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-keep @androidx.room.Dao interface *

# ============================================================================
# App data classes - MUST keep for Gson/Retrofit deserialization
# ============================================================================
-keep class app.stifle.data.** { *; }
-keep class app.stifle.network.** { *; }

# Keep all data classes with their fields
-keepclassmembers class app.stifle.network.** {
    <fields>;
    <init>(...);
}
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

# Kotlin serialization (if used)
-keepattributes RuntimeVisibleAnnotations

# ============================================================================
# Firebase
# ============================================================================
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

