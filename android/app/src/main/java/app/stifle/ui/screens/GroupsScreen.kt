package app.stifle.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
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
    onNavigateBack: () -> Unit
) {
    var groups by remember { mutableStateOf<List<Group>>(emptyList()) }
    var selectedGroup by remember { mutableStateOf<Group?>(null) }
    var leaderboard by remember { mutableStateOf<List<LeaderboardEntry>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var showJoinDialog by remember { mutableStateOf(false) }
    var showCreateDialog by remember { mutableStateOf(false) }
    
    val scope = rememberCoroutineScope()
    
    // Load groups on mount
    LaunchedEffect(Unit) {
        when (val result = groupRepository.getGroups()) {
            is Result.Success -> groups = result.data
            is Result.Error -> { /* TODO: show error */ }
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
            TopAppBar(
                title = { Text(selectedGroup?.name ?: "Groups") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (selectedGroup != null) {
                            selectedGroup = null
                            leaderboard = emptyList()
                        } else {
                            onNavigateBack()
                        }
                    }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (selectedGroup == null) {
                        IconButton(onClick = { showCreateDialog = true }) {
                            Icon(Icons.Default.Add, contentDescription = "Create group")
                        }
                    }
                }
            )
        }
    ) { padding ->
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (selectedGroup != null) {
            // Leaderboard view
            if (leaderboard.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentAlignment = Alignment.Center
                ) {
                    Text("No data this week")
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(leaderboard) { entry ->
                        LeaderboardCard(entry = entry)
                    }
                }
            }
        } else {
            // Groups list
            if (groups.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "No groups yet",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    Button(onClick = { showCreateDialog = true }) {
                        Text("Create a group")
                    }
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    OutlinedButton(onClick = { showJoinDialog = true }) {
                        Text("Join with invite code")
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    item {
                        OutlinedButton(
                            onClick = { showJoinDialog = true },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Join with invite code")
                        }
                    }
                    
                    items(groups) { group ->
                        GroupCard(
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
        var code by remember { mutableStateOf("") }
        var error by remember { mutableStateOf<String?>(null) }
        var joining by remember { mutableStateOf(false) }
        
        AlertDialog(
            onDismissRequest = { showJoinDialog = false },
            title = { Text("Join Group") },
            text = {
                Column {
                    OutlinedTextField(
                        value = code,
                        onValueChange = { code = it.uppercase() },
                        label = { Text("Invite Code") },
                        singleLine = true
                    )
                    error?.let {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(it, color = MaterialTheme.colorScheme.error)
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
                    enabled = code.isNotBlank() && !joining
                ) {
                    Text("Join")
                }
            },
            dismissButton = {
                TextButton(onClick = { showJoinDialog = false }) {
                    Text("Cancel")
                }
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
            title = { Text("Create Group") },
            text = {
                Column {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it; createError = null },
                        label = { Text("Group Name") },
                        singleLine = true
                    )
                    createError?.let {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(it, color = MaterialTheme.colorScheme.error)
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
                    enabled = name.isNotBlank() && !creating
                ) {
                    if (creating) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("Create")
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GroupCard(
    group: Group,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = group.name,
                    style = MaterialTheme.typography.titleMedium
                )
                group.memberCount?.let { count ->
                    Text(
                        text = "$count members",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun LeaderboardCard(entry: LeaderboardEntry) {
    val isTop3 = entry.rank <= 3
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = if (entry.isYou) CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        ) else CardDefaults.cardColors()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Rank
            Box(
                modifier = Modifier.width(40.dp),
                contentAlignment = Alignment.Center
            ) {
                if (isTop3) {
                    Icon(
                        Icons.Default.Star,
                        contentDescription = null,
                        tint = when (entry.rank) {
                            1 -> MaterialTheme.colorScheme.primary
                            2 -> MaterialTheme.colorScheme.secondary
                            else -> MaterialTheme.colorScheme.tertiary
                        }
                    )
                } else {
                    Text(
                        text = "#${entry.rank}",
                        style = MaterialTheme.typography.titleMedium
                    )
                }
            }
            
            Spacer(modifier = Modifier.width(12.dp))
            
            // User info
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = entry.username,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = if (entry.isYou) FontWeight.Bold else FontWeight.Normal
                    )
                    
                    if (entry.trackingStatus != "verified") {
                        Spacer(modifier = Modifier.width(8.dp))
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = "Tracking issue",
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
                
                Text(
                    text = "${entry.streakCount} streaks • longest ${formatLongestStreak(entry.longestStreak)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            // Points
            Text(
                text = String.format("%.1f", entry.totalPoints),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

private fun formatLongestStreak(seconds: Int): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    
    return when {
        hours > 0 -> "${hours}h ${minutes}m"
        else -> "${minutes}m"
    }
}
