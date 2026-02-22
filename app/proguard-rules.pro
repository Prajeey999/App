# Keep WebView JS interfaces
-keepclassmembers class com.analyticspro.app.MainActivity$AndroidBridge {
    public *;
}

# Keep Kotlin coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}

# Keep JSON
-keepclassmembers class * {
    @org.json.* <methods>;
}
