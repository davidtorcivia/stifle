package app.stifle.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build

/**
 * Receives BOOT_COMPLETED to ensure tracking continues after reboot.
 * Re-registers the screen state receiver if needed.
 */
class BootReceiver : BroadcastReceiver() {
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            
            // The ScreenStateReceiver is registered in manifest, so it should
            // already be active. But we schedule a sync to catch up on any
            // events that might have been missed during reboot.
            SyncWorker.enqueue(context)
        }
    }
}

/**
 * Helper to register screen state receiver programmatically if needed.
 * The manifest-registered receiver handles most cases, but this is useful
 * for dynamic registration during app lifecycle.
 */
object ScreenStateRegistrar {
    
    private var isRegistered = false
    
    fun register(context: Context) {
        if (isRegistered) return
        
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_USER_PRESENT)
            addAction(Intent.ACTION_SCREEN_OFF)
        }
        
        val receiver = ScreenStateReceiver()
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
        
        isRegistered = true
    }
}
