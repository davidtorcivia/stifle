package app.stifle.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import app.stifle.MainActivity
import app.stifle.R
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Firebase Cloud Messaging Service
 * 
 * Handles incoming push notifications for:
 * - Temptation notifications (encouraging messages to put phone down)
 * - Group activity (someone beat your score)
 * - Weekly summaries
 */
class StifleMessagingService : FirebaseMessagingService() {
    
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    companion object {
        // Notification channels
        const val CHANNEL_TEMPTATION = "temptation"
        const val CHANNEL_SOCIAL = "social"
        const val CHANNEL_WEEKLY = "weekly"
        
        fun createNotificationChannels(context: Context) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // Temptation channel - gentle reminders to put phone down
            val temptationChannel = NotificationChannel(
                CHANNEL_TEMPTATION,
                "Gentle Reminders",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Encouraging messages to help you stay focused"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 100, 50, 100) // Gentle double buzz
            }
            
            // Social channel - friend activity
            val socialChannel = NotificationChannel(
                CHANNEL_SOCIAL,
                "Friend Activity",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Updates from your groups and friends"
            }
            
            // Weekly channel - summaries
            val weeklyChannel = NotificationChannel(
                CHANNEL_WEEKLY,
                "Weekly Summary",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Your weekly screen time summary"
            }
            
            manager.createNotificationChannels(
                listOf(temptationChannel, socialChannel, weeklyChannel)
            )
        }
    }
    
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        
        // Send token to backend
        serviceScope.launch {
            try {
                val app = application as? app.stifle.StifleApp ?: return@launch
                val tokenManager = app.container.tokenManager
                
                // Store token locally for later registration
                tokenManager.setPushToken(token)
                
                // If user is logged in, register with server
                val isLoggedIn = tokenManager.isLoggedInFlow().first() == true
                if (isLoggedIn) {
                    registerTokenWithServer(token)
                }
            } catch (e: Exception) {
                // Log but don't crash
                android.util.Log.e("StifleMessaging", "Failed to handle new token", e)
            }
        }
    }
    
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        
        val data = message.data
        val type = data["type"] ?: "temptation"
        
        when (type) {
            "temptation" -> showTemptationNotification(data)
            "social" -> showSocialNotification(data)
            "weekly" -> showWeeklyNotification(data)
        }
    }
    
    private fun showTemptationNotification(data: Map<String, String>) {
        val title = data["title"] ?: "Time for a break?"
        val body = data["body"] ?: "Your phone can wait. You've got this."
        
        showNotification(
            channelId = CHANNEL_TEMPTATION,
            notificationId = 1001,
            title = title,
            body = body,
            autoCancel = true
        )
    }
    
    private fun showSocialNotification(data: Map<String, String>) {
        val title = data["title"] ?: "Group update"
        val body = data["body"] ?: "Something happened in your group"
        
        showNotification(
            channelId = CHANNEL_SOCIAL,
            notificationId = 2001,
            title = title,
            body = body,
            autoCancel = true
        )
    }
    
    private fun showWeeklyNotification(data: Map<String, String>) {
        val title = data["title"] ?: "Your week in review"
        val body = data["body"] ?: "See how you did this week"
        
        showNotification(
            channelId = CHANNEL_WEEKLY,
            notificationId = 3001,
            title = title,
            body = body,
            autoCancel = true
        )
    }
    
    private fun showNotification(
        channelId: String,
        notificationId: Int,
        title: String,
        body: String,
        autoCancel: Boolean = true
    ) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(autoCancel)
            .build()
        
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notificationId, notification)
    }
    
    private suspend fun registerTokenWithServer(token: String) {
        try {
            val app = application as? app.stifle.StifleApp ?: return
            val api = app.container.usersApi
            api.registerPushToken(mapOf(
                "token" to token,
                "platform" to "android"
            ))
        } catch (e: Exception) {
            android.util.Log.e("StifleMessaging", "Failed to register token", e)
        }
    }
}
