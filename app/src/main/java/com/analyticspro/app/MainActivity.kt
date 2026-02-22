package com.analyticspro.app

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.analyticspro.app.databinding.ActivityMainBinding
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_SKIP_LOGIN = "skip_login"
        private const val WALLET_URL = "https://juicychat.ai/my-wallet"
        private const val API_BASE = "https://revpro.onrender.com"
        private const val HEARTBEAT_INTERVAL = 5 * 60 * 1000L
    }

    private lateinit var binding: ActivityMainBinding
    private lateinit var tokenManager: TokenManager
    private var heartbeatJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    // ── LIFECYCLE ──────────────────────────────────────────────────────────
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        tokenManager = TokenManager(this)

        window.statusBarColor = Color.parseColor("#050508")
        window.navigationBarColor = Color.parseColor("#050508")

        if (intent.getBooleanExtra(EXTRA_SKIP_LOGIN, false) && tokenManager.hasValidToken()) {
            showWebView()
        } else {
            showLoginScreen()
        }
    }

    override fun onBackPressed() {
        if (binding.webView.visibility == View.VISIBLE && binding.webView.canGoBack()) {
            // Don't allow navigating away from wallet page — just ignore back
            // or optionally show exit dialog
            showExitDialog()
        } else if (binding.loginContainer.visibility == View.VISIBLE) {
            showExitDialog()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        heartbeatJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }

    // ── LOGIN SCREEN ───────────────────────────────────────────────────────
    private fun showLoginScreen() {
        binding.loginContainer.visibility = View.VISIBLE
        binding.webView.visibility = View.GONE
        binding.loadingOverlay.visibility = View.GONE

        binding.btnLogin.setOnClickListener { attemptLogin() }
        binding.btnPatreon.setOnClickListener { attemptPatreonLogin() }

        binding.emailInput.setOnEditorActionListener { _, _, _ ->
            binding.keyInput.requestFocus(); true
        }
        binding.keyInput.setOnEditorActionListener { _, _, _ ->
            attemptLogin(); true
        }
    }

    private fun attemptLogin() {
        val email = binding.emailInput.text.toString().trim()
        val key = binding.keyInput.text.toString().trim()

        if (email.isEmpty() || key.isEmpty()) {
            showLoginError("Please enter your email and license key")
            return
        }

        setLoginLoading(true)
        binding.errorMsg.visibility = View.GONE

        scope.launch {
            val result = withContext(Dispatchers.IO) { verifyCredentials(email, key) }
            setLoginLoading(false)

            if (result.success) {
                tokenManager.saveToken(result.token!!, email, key)
                startHeartbeat()
                showWebView()
            } else {
                showLoginError(result.error ?: "Invalid credentials")
            }
        }
    }

    private fun attemptPatreonLogin() {
        // For WebView-based Patreon OAuth: open Patreon in a dialog WebView
        showPatreonDialog()
    }

    private fun showLoginError(msg: String) {
        binding.errorMsg.text = msg
        binding.errorMsg.visibility = View.VISIBLE
    }

    private fun setLoginLoading(loading: Boolean) {
        binding.btnLogin.isEnabled = !loading
        binding.btnPatreon.isEnabled = !loading
        binding.btnLogin.text = if (loading) "Verifying..." else "Unlock Dashboard"
        binding.loginProgress.visibility = if (loading) View.VISIBLE else View.GONE
    }

    // ── PATREON DIALOG ─────────────────────────────────────────────────────
    @SuppressLint("SetJavaScriptEnabled")
    private fun showPatreonDialog() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_patreon, null)
        val webView = dialogView.findViewById<WebView>(R.id.patreonWebView)
        val dialog = AlertDialog.Builder(this)
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                // Check if redirect came back with token info
                url?.let { checkPatreonCallback(it, dialog) }
            }
        }

        webView.loadUrl("$API_BASE/auth/patreon")
        dialog.show()
    }

    private fun checkPatreonCallback(url: String, dialog: AlertDialog) {
        // Handle the postMessage by injecting JS to capture token from page
        if (url.contains("patreon_success") || url.contains("token=")) {
            try {
                val uri = android.net.Uri.parse(url)
                val token = uri.getQueryParameter("token")
                val email = uri.getQueryParameter("email") ?: "Patreon Member"
                if (!token.isNullOrEmpty()) {
                    tokenManager.saveToken(token, email, "PATREON_ACTIVE")
                    dialog.dismiss()
                    startHeartbeat()
                    showWebView()
                }
            } catch (e: Exception) { /* keep dialog open */ }
        }
    }

    // ── WEBVIEW ────────────────────────────────────────────────────────────
    @SuppressLint("SetJavaScriptEnabled")
    private fun showWebView() {
        if (!isNetworkAvailable()) {
            showNoInternet()
            return
        }

        binding.loginContainer.visibility = View.GONE
        binding.loadingOverlay.visibility = View.VISIBLE
        binding.webView.visibility = View.VISIBLE

        setupWebView()
        startHeartbeat()
        binding.webView.loadUrl(WALLET_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        with(binding.webView) {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                userAgentString = userAgentString.replace("wv", "") // look like real Chrome
                mediaPlaybackRequiresUserGesture = false
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                loadWithOverviewMode = true
                useWideViewPort = true
            }

            // Allow JS to call back into Android (for token passing)
            addJavascriptInterface(AndroidBridge(), "AndroidBridge")

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    // Lock navigation: only allow juicychat.ai domains
                    return if (url.contains("juicychat.ai") || url.contains(API_BASE)) {
                        false // let WebView handle it
                    } else {
                        // Block external navigation silently
                        true
                    }
                }

                override fun onPageFinished(view: WebView, url: String) {
                    binding.loadingOverlay.visibility = View.GONE
                    // Only inject on the wallet page
                    if (url.contains("juicychat.ai")) {
                        injectExtension(view)
                    }
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) {
                        binding.loadingOverlay.visibility = View.GONE
                        showNetworkError()
                    }
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, newProgress: Int) {
                    binding.pageProgress.progress = newProgress
                    binding.pageProgress.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
                }
            }
        }
    }

    // ── EXTENSION INJECTION ────────────────────────────────────────────────
    private fun injectExtension(webView: WebView) {
        val token = tokenManager.getToken() ?: return
        val email = tokenManager.getEmail() ?: ""

        // Pass token into the page's localStorage so extension can pick it up
        val tokenSetupJs = """
            (function() {
                try {
                    localStorage.setItem('jwtToken', ${JSONObject.quote(token)});
                    localStorage.setItem('userEmail', ${JSONObject.quote(email)});
                    localStorage.setItem('licenseKey', 'APP_SESSION');
                } catch(e) {}
            })();
        """.trimIndent()

        webView.evaluateJavascript(tokenSetupJs, null)

        // Load and inject the full extension script
        scope.launch {
            val extensionJs = withContext(Dispatchers.IO) {
                loadExtensionScript()
            }
            if (extensionJs != null) {
                webView.evaluateJavascript(extensionJs, null)
            }
        }
    }

    private fun loadExtensionScript(): String? {
        return try {
            assets.open("extension.js").bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            null
        }
    }

    // ── HEARTBEAT ──────────────────────────────────────────────────────────
    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(HEARTBEAT_INTERVAL)
                val token = tokenManager.getToken() ?: break
                val valid = withContext(Dispatchers.IO) { validateToken(token) }
                if (!valid) {
                    tokenManager.clearToken()
                    binding.webView.loadUrl("about:blank")
                    showWebView.let { showLoginScreen() }
                    Toast.makeText(this@MainActivity, "Session expired. Please log in again.", Toast.LENGTH_LONG).show()
                    break
                }
            }
        }
    }

    // ── API CALLS ──────────────────────────────────────────────────────────
    data class VerifyResult(val success: Boolean, val token: String? = null, val error: String? = null)

    private fun verifyCredentials(email: String, licenseKey: String): VerifyResult {
        return try {
            val url = URL("$API_BASE/verify")
            val conn = url.openConnection() as HttpURLConnection
            conn.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("ngrok-skip-browser-warning", "true")
                doOutput = true
                connectTimeout = 10000
                readTimeout = 10000
            }
            val body = """{"email":"$email","license_key":"$licenseKey"}"""
            OutputStreamWriter(conn.outputStream).use { it.write(body) }

            val response = conn.inputStream.bufferedReader().readText()
            val json = JSONObject(response)
            if (json.optBoolean("success") && json.has("token")) {
                VerifyResult(true, json.getString("token"))
            } else {
                VerifyResult(false, error = json.optString("message", "Invalid credentials"))
            }
        } catch (e: Exception) {
            VerifyResult(false, error = "Connection error. Please check your internet.")
        }
    }

    private fun validateToken(token: String): Boolean {
        return try {
            val url = URL("$API_BASE/validate-token")
            val conn = url.openConnection() as HttpURLConnection
            conn.apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("ngrok-skip-browser-warning", "true")
                connectTimeout = 10000
                readTimeout = 10000
            }
            val response = conn.inputStream.bufferedReader().readText()
            JSONObject(response).optBoolean("valid", false)
        } catch (e: Exception) {
            true // assume valid on network error to avoid false logouts
        }
    }

    // ── JAVASCRIPT BRIDGE ──────────────────────────────────────────────────
    inner class AndroidBridge {
        @JavascriptInterface
        fun onLogout() {
            runOnUiThread {
                tokenManager.clearToken()
                heartbeatJob?.cancel()
                showLoginScreen()
            }
        }

        @JavascriptInterface
        fun getToken(): String = tokenManager.getToken() ?: ""

        @JavascriptInterface
        fun getEmail(): String = tokenManager.getEmail() ?: ""
    }

    // ── HELPERS ────────────────────────────────────────────────────────────
    private fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun showNoInternet() {
        binding.loadingOverlay.visibility = View.GONE
        Toast.makeText(this, "No internet connection", Toast.LENGTH_LONG).show()
        showLoginScreen()
    }

    private fun showNetworkError() {
        Toast.makeText(this, "Failed to load page. Pull down to retry.", Toast.LENGTH_SHORT).show()
    }

    private fun showExitDialog() {
        AlertDialog.Builder(this)
            .setTitle("Exit Analytics Pro?")
            .setMessage("Are you sure you want to close the app?")
            .setPositiveButton("Exit") { _, _ -> finish() }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
