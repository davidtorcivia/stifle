package app.stifle.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.background
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.stifle.data.repository.AuthRepository
import app.stifle.network.LastStreak
import app.stifle.network.UserStats
import app.stifle.network.UsersApi
import app.stifle.network.WeeklySummary
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    authRepository: AuthRepository,
    usersApi: UsersApi,
    onNavigateToSettings: () -> Unit,
    onLogout: () -> Unit
) {
    var stats by remember { mutableStateOf<UserStats?>(null) }
    var weeklySummary by remember { mutableStateOf<WeeklySummary?>(null) }
    var isRefreshing by remember { mutableStateOf(false) }
    
    val scope = rememberCoroutineScope()
    
    // Fetch stats on load
    LaunchedEffect(Unit) {
        try {
            val response = usersApi.getStats()
            if (response.isSuccessful) {
                stats = response.body()
            }
            // Also fetch weekly summary
            val summaryResponse = usersApi.getWeeklySummary()
            if (summaryResponse.isSuccessful) {
                weeklySummary = summaryResponse.body()
            }
        } catch (_: Exception) {}
    }
    
    // Refresh stats function
    fun refreshStats() {
        scope.launch {
            isRefreshing = true
            try {
                val response = usersApi.getStats()
                if (response.isSuccessful) {
                    stats = response.body()
                }
                // Also refresh weekly summary
                val summaryResponse = usersApi.getWeeklySummary()
                if (summaryResponse.isSuccessful) {
                    weeklySummary = summaryResponse.body()
                }
            } catch (_: Exception) {}
            isRefreshing = false
        }
    }
    
    // Auto-refresh when app comes back to foreground
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                // Refresh stats when app resumes
                scope.launch {
                    try {
                        val response = usersApi.getStats()
                        if (response.isSuccessful) {
                            stats = response.body()
                        }
                        val summaryResponse = usersApi.getWeeklySummary()
                        if (summaryResponse.isSuccessful) {
                            weeklySummary = summaryResponse.body()
                        }
                    } catch (_: Exception) {}
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
    
    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0)
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Compact header with settings
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Spacer(modifier = Modifier.width(40.dp)) // Balance for settings icon
                Text(
                    "Stifle Your Phone",
                    style = MaterialTheme.typography.headlineMedium,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Serif,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center
                )
                IconButton(
                    onClick = onNavigateToSettings,
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        Icons.Default.Settings, 
                        contentDescription = "Settings",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            
            // === HERO SECTION ===
            // Show last streak info or encouraging message
            val lastStreak = stats?.lastStreak
            if (lastStreak != null && lastStreak.durationSeconds >= 600) {
                // Show last meaningful streak
                Text(
                    text = "Last Session",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = formatDuration(lastStreak.durationSeconds),
                    style = MaterialTheme.typography.displayLarge.copy(fontSize = 64.sp),
                    fontWeight = FontWeight.Light,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                )
                Text(
                    text = "+${String.format("%.0f", lastStreak.pointsEarned)} points",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            } else {
                // No meaningful streak yet
                Text(
                    text = "Go Offline",
                    style = MaterialTheme.typography.headlineMedium,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Serif,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Lock your phone for 10+ minutes to earn points.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }
            
            Spacer(modifier = Modifier.weight(0.1f))

            // === STATS ROW (Minimalist) ===
            Divider(color = MaterialTheme.colorScheme.outlineVariant)
            
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Weekly Points
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = String.format("%.0f", stats?.weeklyPoints ?: 0.0),
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Normal
                    )
                    Text(
                        text = "pts this week",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        letterSpacing = 1.sp
                    )
                }
                
                // Vertical Divider
                Box(
                    modifier = Modifier
                        .height(40.dp)
                        .width(1.dp)
                        .background(MaterialTheme.colorScheme.outlineVariant)
                )

                // Today's Streaks
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "${stats?.todayStreakCount ?: 0}",
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Normal
                    )
                    Text(
                        text = "streaks today",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        letterSpacing = 1.sp
                    )
                }
            }
            
            Divider(color = MaterialTheme.colorScheme.outlineVariant)
            
            // Weekly Summary Card (ghost comparisons)
            weeklySummary?.let { summary ->
                Spacer(modifier = Modifier.height(20.dp))
                WeeklySummaryCard(summary)
            }

            Spacer(modifier = Modifier.weight(0.2f))
            
            // === SCORING HINT ===
            Text(
                text = "The longer you stay away, the more you earn. But don't worry — you can't just sleep your way to the top.",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
            )
            
            Spacer(modifier = Modifier.height(32.dp))
            

        }
    }
}



private fun formatDuration(seconds: Int): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val secs = seconds % 60
    
    return when {
        hours > 0 -> String.format("%d:%02d:%02d", hours, minutes, secs)
        else -> String.format("%d:%02d", minutes, secs)
    }
}

@Composable
private fun WeeklySummaryCard(summary: WeeklySummary) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Friends rank (if has friends)
            if (summary.thisWeek.totalParticipants > 1) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Among Friends",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "${summary.thisWeek.rank} of ${summary.thisWeek.totalParticipants}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (summary.thisWeek.rank <= 3) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                    )
                }
                
                // vs Friends Average (show if above or below for competition)
                summary.vsFriendsAvg?.let { vs ->
                    val prefix = if (vs.isAboveAvg) "+" else ""
                    val color = if (vs.isAboveAvg) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    Text(
                        text = "${prefix}${String.format("%.0f", vs.percentDiff)}% vs average",
                        style = MaterialTheme.typography.bodySmall,
                        color = color,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
                
                Spacer(modifier = Modifier.height(12.dp))
                Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                Spacer(modifier = Modifier.height(12.dp))
            }
            
            // Ghost comparisons (self-improvement, positive only)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                // vs Last Week (only show if positive or if we have data)
                summary.vsLastWeek?.let { vs ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        val arrow = if (vs.wasImprovement) "\u2191" else "\u2193" // ↑ or ↓
                        val color = if (vs.wasImprovement) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        Text(
                            text = "$arrow ${String.format("%.0f", kotlin.math.abs(vs.percentDiff))}%",
                            style = MaterialTheme.typography.titleMedium,
                            color = color,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "vs last week",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                
                // vs Personal Best
                summary.vsPersonalBest?.let { vs ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        if (vs.isBeat) {
                            Text(
                                text = "\u2605 NEW BEST", // ★
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.tertiary,
                                fontWeight = FontWeight.Bold
                            )
                        } else if (vs.pointsAway > 0) {
                            Text(
                                text = "${String.format("%.0f", vs.pointsAway)} away",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text(
                            text = if (vs.isBeat) "personal best" else "from best",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            
            // Positive trend badge (only if 2+ weeks improving)
            summary.trend?.let { trend ->
                if (trend.weeksImproving >= 2) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = "\u2191 ${trend.weeksImproving} weeks improving", // ↑
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.tertiary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }
    }
}
