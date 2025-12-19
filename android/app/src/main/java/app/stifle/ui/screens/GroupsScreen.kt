package app.stifle.ui.screens

import android.content.Intent // Added
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Share // Added
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.platform.LocalContext // Added
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.stifle.data.repository.GroupRepository
import app.stifle.data.repository.Result
import app.stifle.network.Group
import app.stifle.network.LeaderboardEntry
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupsScreen(
    groupRepository: GroupRepository,
    initialJoinCode: String? = null // Added parameter
) {
    var groups by remember { mutableStateOf<List<Group>>(emptyList()) }
    var selectedGroup by remember { mutableStateOf<Group?>(null) }
    var leaderboard by remember { mutableStateOf<List<LeaderboardEntry>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var showJoinDialog by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") } // Moved state up
    var showCreateDialog by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) } // Added error message state
    
    // Handle initial join code
    LaunchedEffect(initialJoinCode) {
        if (!initialJoinCode.isNullOrBlank()) {
            code = initialJoinCode
            showJoinDialog = true
        }
    }
    
    val scope = rememberCoroutineScope()
    
    // Load groups on mount
    LaunchedEffect(Unit) {
        when (val result = groupRepository.getGroups()) {
            is Result.Success -> groups = result.data
            is Result.Error -> {
                errorMessage = result.message
                isLoading = false
            }
        }
        isLoading = false
    }
    
    // Load leaderboard when group selected
    LaunchedEffect(selectedGroup) {
        selectedGroup?.let { group ->
            when (val result = groupRepository.getLeaderboard(group.id)) {
                is Result.Success -> leaderboard = result.data
                is Result.Error -> leaderboard = emptyList()
            }
        }
    }
    
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { 
                    Text(
                        selectedGroup?.name ?: "Groups",
                        style = MaterialTheme.typography.headlineSmall,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                    ) 
                },
                navigationIcon = {
                    if (selectedGroup != null) {
                        IconButton(onClick = {
                            selectedGroup = null
                            leaderboard = emptyList()
                        }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
                actions = {
                    if (selectedGroup == null) {
                        IconButton(onClick = { showCreateDialog = true }) {
                            Icon(Icons.Default.Add, contentDescription = "Create group")
                        }
                    } else {
                        // Share Button
                        val context = LocalContext.current
                        selectedGroup?.inviteCode?.let { code ->
                             IconButton(onClick = {
                                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, "Join my group on Stifle! \nLink: stifle://join?code=$code\nCode: $code")
                                }
                                context.startActivity(Intent.createChooser(shareIntent, "Share Group Code"))
                             }) {
                                 Icon(Icons.Default.Share, contentDescription = "Share code")
                             }
                        }
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = androidx.compose.ui.graphics.Color.Transparent
                ),
                windowInsets = WindowInsets(0, 0, 0, 0)
            )
        },
        contentWindowInsets = WindowInsets(0, 0, 0, 0)
    ) { padding ->
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(strokeWidth = 2.dp)
            }
        } else if (selectedGroup != null) {
            // === LEADERBOARD VIEW ===
            if (leaderboard.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    Text("No activity recorded yet.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.outline)
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                ) {
                    // Refresh indicator
                    item {
                        Text(
                            text = "Updates every 4 hours for privacy",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
                            textAlign = TextAlign.Center,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                        )
                    }
                    items(leaderboard) { entry ->
                        GroupLeaderboardItem(entry)
                        Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                    }
                }
            }
        } else {
            // === GROUPS LIST ===
            if (groups.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "Gather your people.",
                        style = MaterialTheme.typography.headlineSmall,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Groups help you hold each other accountable.",
                        style = MaterialTheme.typography.bodyLarge,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    
                    Spacer(modifier = Modifier.height(32.dp))
                    
                    OutlinedButton(
                        onClick = { showCreateDialog = true },
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp)
                    ) { Text("Create Group") }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    TextButton(onClick = { showJoinDialog = true }) { Text("Have an invite code?") }
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                ) {
                    item {
                         Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp),
                            horizontalArrangement = Arrangement.Center
                        ) {
                            TextButton(onClick = { showJoinDialog = true }) {
                                Text("Join via Code", style = MaterialTheme.typography.labelLarge)
                            }
                        }
                    }
                    
                    items(groups) { group ->
                        GroupListItem(
                            group = group,
                            onClick = { selectedGroup = group }
                        )
                    }
                }
            }
        }
    }
    
    // Join dialog
    if (showJoinDialog) {
        var error by remember { mutableStateOf<String?>(null) }
        var joining by remember { mutableStateOf(false) }
        
        AlertDialog(
            onDismissRequest = { showJoinDialog = false },
            title = { Text("Join Group", fontFamily = androidx.compose.ui.text.font.FontFamily.Serif) },
            text = {
                Column {
                    OutlinedTextField(
                        value = code,
                        onValueChange = { code = it.uppercase() },
                        label = { Text("Invite Code") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp)
                    )
                    error?.let {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        joining = true
                        scope.launch {
                            when (val result = groupRepository.joinGroup(code)) {
                                is Result.Success -> {
                                    showJoinDialog = false
                                    // Refresh groups
                                    when (val refresh = groupRepository.getGroups()) {
                                        is Result.Success -> groups = refresh.data
                                        is Result.Error -> {}
                                    }
                                }
                                is Result.Error -> {
                                    error = result.message
                                    joining = false
                                }
                            }
                        }
                    },
                    enabled = code.isNotBlank() && !joining,
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp)
                ) { Text("Join") }
            },
            dismissButton = {
                TextButton(onClick = { showJoinDialog = false }) { Text("Cancel") }
            }
        )
    }
    
    // Create dialog
    if (showCreateDialog) {
        var name by remember { mutableStateOf("") }
        var creating by remember { mutableStateOf(false) }
        var createError by remember { mutableStateOf<String?>(null) }
        
        AlertDialog(
            onDismissRequest = { showCreateDialog = false },
            title = { Text("Create Collective", fontFamily = androidx.compose.ui.text.font.FontFamily.Serif) },
            text = {
                Column {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it; createError = null },
                        label = { Text("Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp)
                    )
                    createError?.let {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        creating = true
                        createError = null
                        scope.launch {
                            when (val result = groupRepository.createGroup(name)) {
                                is Result.Success -> {
                                    showCreateDialog = false
                                    groups = groups + result.data
                                }
                                is Result.Error -> {
                                    createError = result.message
                                    creating = false
                                }
                            }
                        }
                    },
                    enabled = name.isNotBlank() && !creating,
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp)
                ) {
                    if (creating) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Create")
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateDialog = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun GroupListItem(group: Group, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 24.dp, vertical = 24.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = group.name,
                style = MaterialTheme.typography.headlineSmall,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
            )
            group.memberCount?.let { count ->
                Text(
                    text = "$count members",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Icon(Icons.Default.ArrowBack, null, modifier = Modifier.rotate(180f), tint = MaterialTheme.colorScheme.outlineVariant)
    }
    Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha=0.3f))
}

@Composable
private fun GroupLeaderboardItem(entry: LeaderboardEntry) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (entry.isYou) MaterialTheme.colorScheme.surfaceVariant.copy(alpha=0.3f) else androidx.compose.ui.graphics.Color.Transparent)
            .padding(horizontal = 24.dp, vertical = 20.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Rank
        Text(
            text = "${entry.rank}",
            style = if (entry.rank <= 3) MaterialTheme.typography.displayMedium else MaterialTheme.typography.headlineSmall,
            fontFamily = androidx.compose.ui.text.font.FontFamily.Serif,
            fontWeight = FontWeight.Light,
            color = when(entry.rank) {
                1 -> MaterialTheme.colorScheme.primary
                2 -> MaterialTheme.colorScheme.onSurface.copy(alpha=0.6f)
                3 -> MaterialTheme.colorScheme.onSurface.copy(alpha=0.4f)
                else -> MaterialTheme.colorScheme.outlineVariant
            },
            modifier = Modifier.width(48.dp)
        )
        
        Spacer(modifier = Modifier.width(16.dp))
        
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = entry.username,
                    style = MaterialTheme.typography.titleMedium,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Serif,
                    fontWeight = if (entry.isYou) FontWeight.Bold else FontWeight.Normal
                )
                if (entry.isYou) {
                    Spacer(modifier = Modifier.width(6.dp))
                    Box(modifier = Modifier.size(4.dp).background(MaterialTheme.colorScheme.primary, androidx.compose.foundation.shape.CircleShape))
                }
            }
            // Tracking status warning
            if (entry.trackingStatus != "verified") {
                Text(
                    text = "Tracking inactive",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error.copy(alpha=0.7f)
                )
            } else {
                 Text(
                    text = "Longest: ${formatLongestStreak(entry.longestStreak)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        
        Text(
            text = String.format("%.0f", entry.totalPoints),
            style = MaterialTheme.typography.headlineSmall,
            fontFamily = androidx.compose.ui.text.font.FontFamily.Serif,
            fontWeight = FontWeight.Normal,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

private fun formatLongestStreak(seconds: Int): String {
    if (seconds == 0) return "-"
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    return when {
        hours > 0 -> "${hours}h ${minutes}m"
        else -> "${minutes}m"
    }
}
