package app.stifle.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.stifle.data.repository.FriendsRepository
import app.stifle.data.repository.Result
import app.stifle.network.FriendLeaderboardEntry
import app.stifle.network.FriendRequest
import app.stifle.network.FriendSearchResult
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FriendsScreen(
    friendsRepository: FriendsRepository
) {
    // === UI STATE ===
    var selectedTab by remember { mutableStateOf(0) }
    var leaderboard by remember { mutableStateOf<List<FriendLeaderboardEntry>>(emptyList()) }
    var incomingRequests by remember { mutableStateOf<List<FriendRequest>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var showAddFriendDialog by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val scope = rememberCoroutineScope()
    
    // Load data
    fun refreshData() {
        scope.launch {
            isLoading = true
            errorMessage = null
            
            when (val result = friendsRepository.getLeaderboard()) {
                is Result.Success -> leaderboard = result.data
                is Result.Error -> errorMessage = result.message
            }
            
            when (val result = friendsRepository.getIncomingRequests()) {
                is Result.Success -> incomingRequests = result.data
                is Result.Error -> { /* Silent fail for requests */ }
            }
            
            isLoading = false
        }
    }
    
    LaunchedEffect(Unit) {
        refreshData()
    }
    
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { 
                    Text(
                        "Friends", 
                        style = MaterialTheme.typography.headlineSmall,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                    ) 
                },
                actions = {
                    IconButton(onClick = { showAddFriendDialog = true }) {
                        Icon(Icons.Default.PersonAdd, contentDescription = "Add Friend")
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = androidx.compose.ui.graphics.Color.Transparent
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Minimal Tabs
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.Center
            ) {
                TextButton(
                    onClick = { selectedTab = 0 },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = if (selectedTab == 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                ) {
                    Text(
                        "Leaderboard",
                        style = if (selectedTab == 0) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyLarge,
                        fontWeight = if (selectedTab == 0) FontWeight.Bold else FontWeight.Normal,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                    )
                }
                
                Spacer(modifier = Modifier.width(16.dp))
                Text(
                    "/", 
                    modifier = Modifier.align(Alignment.CenterVertically),
                    color = MaterialTheme.colorScheme.outlineVariant
                )
                Spacer(modifier = Modifier.width(16.dp))

                TextButton(
                    onClick = { selectedTab = 1 },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = if (selectedTab == 1) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Requests",
                            style = if (selectedTab == 1) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyLarge,
                            fontWeight = if (selectedTab == 1) FontWeight.Bold else FontWeight.Normal,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                        )
                        if (incomingRequests.isNotEmpty()) {
                            Spacer(modifier = Modifier.width(6.dp))
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .background(MaterialTheme.colorScheme.error, androidx.compose.foundation.shape.CircleShape)
                            )
                        }
                    }
                }
            }
            
            Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
            
            when (selectedTab) {
                0 -> LeaderboardTab(
                    leaderboard = leaderboard,
                    isLoading = isLoading,
                    errorMessage = errorMessage,
                    onRefresh = { refreshData() }
                )
                1 -> RequestsTab(
                    requests = incomingRequests,
                    isLoading = isLoading,
                    friendsRepository = friendsRepository,
                    onRequestHandled = { refreshData() }
                )
            }
        }
    }
    
    // Add Friend Dialog
    if (showAddFriendDialog) {
        AddFriendDialog(
            friendsRepository = friendsRepository,
            onDismiss = { showAddFriendDialog = false },
            onFriendAdded = { refreshData() }
        )
    }
}

@Composable
private fun LeaderboardTab(
    leaderboard: List<FriendLeaderboardEntry>,
    isLoading: Boolean,
    errorMessage: String?,
    onRefresh: () -> Unit
) {
    if (isLoading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(strokeWidth = 2.dp)
        }
        return
    }
    
    if (errorMessage != null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(errorMessage, color = MaterialTheme.colorScheme.error, fontFamily = androidx.compose.ui.text.font.FontFamily.Serif)
                TextButton(onClick = onRefresh) { Text("Retry") }
            }
        }
        return
    }
    
    if (leaderboard.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
            Text(
                "No friends yet.\nAdd someone to compete.",
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
            )
        }
        return
    }
    
    LazyColumn(modifier = Modifier.fillMaxSize()) {
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
            LeaderboardItem(entry)
            Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
        }
    }
}

@Composable
private fun LeaderboardItem(entry: FriendLeaderboardEntry) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (entry.isCurrentUser) MaterialTheme.colorScheme.surfaceVariant.copy(alpha=0.3f) else androidx.compose.ui.graphics.Color.Transparent)
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
                1 -> MaterialTheme.colorScheme.primary // Gold-ish
                2 -> MaterialTheme.colorScheme.onSurface.copy(alpha=0.6f) // Silver
                3 -> MaterialTheme.colorScheme.onSurface.copy(alpha=0.4f) // Bronze
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
                    fontWeight = if (entry.isCurrentUser) FontWeight.Bold else FontWeight.Normal
                )
                if (entry.isCurrentUser) {
                    Spacer(modifier = Modifier.width(6.dp))
                    Box(modifier = Modifier.size(4.dp).background(MaterialTheme.colorScheme.primary, androidx.compose.foundation.shape.CircleShape))
                }
            }
            if (entry.streakCount > 0) {
                Text(
                    text = "${entry.streakCount} streaks",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        
        Text(
            text = String.format("%.0f", entry.points),
            style = MaterialTheme.typography.headlineSmall,
            fontFamily = androidx.compose.ui.text.font.FontFamily.Serif,
            fontWeight = FontWeight.Normal,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun RequestsTab(
    requests: List<FriendRequest>,
    isLoading: Boolean,
    friendsRepository: FriendsRepository,
    onRequestHandled: () -> Unit
) {
    val scope = rememberCoroutineScope()
    
    if (isLoading && requests.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    
    if (requests.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No pending requests", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.outline, fontFamily = androidx.compose.ui.text.font.FontFamily.Serif)
        }
        return
    }
    
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(requests) { request ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        request.username, 
                        style = MaterialTheme.typography.titleMedium,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                    )
                    Text(
                        "Wants to connect",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                
                Row {
                    TextButton(
                        onClick = {
                            scope.launch {
                                friendsRepository.respondToRequest(request.id, false)
                                onRequestHandled()
                            }
                        },
                        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                    ) { Text("Decline") }
                    
                    Spacer(modifier = Modifier.width(8.dp))
                    
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                friendsRepository.respondToRequest(request.id, true)
                                onRequestHandled()
                            }
                        },
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp)
                    ) { Text("Accept") }
                }
            }
            Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddFriendDialog(
    friendsRepository: FriendsRepository,
    onDismiss: () -> Unit,
    onFriendAdded: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<FriendSearchResult>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var sendingTo by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    
    val scope = rememberCoroutineScope()
    
    fun doSearch() {
        if (searchQuery.length < 2) return
        scope.launch {
            isSearching = true
            when (val result = friendsRepository.searchUsers(searchQuery)) {
                is Result.Success -> searchResults = result.data
                is Result.Error -> message = result.message
            }
            isSearching = false
        }
    }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        title = { 
            Text(
                "Find a Friend",
                fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
            ) 
        },
        text = {
            Column {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Username or Email") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { doSearch() }),
                    trailingIcon = {
                        IconButton(onClick = { doSearch() }) {
                            Icon(Icons.Default.Search, "Search")
                        }
                    }
                )
                
                Spacer(modifier = Modifier.height(16.dp))
                
                if (isSearching) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                } else if (searchResults.isNotEmpty()) {
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 240.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        items(searchResults) { user ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    user.username,
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                                )
                                
                                when {
                                    sendingTo == user.id -> CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                    user.friendshipStatus == "accepted" -> Icon(Icons.Default.Check, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                    user.friendshipStatus == "pending" -> Text("Sent", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
                                    else -> {
                                        TextButton(
                                            onClick = {
                                                sendingTo = user.id
                                                scope.launch {
                                                    friendsRepository.sendFriendRequest(user.id)
                                                    onFriendAdded()
                                                    sendingTo = null
                                                    doSearch()
                                                }
                                            },
                                            modifier = Modifier.height(32.dp),
                                            contentPadding = PaddingValues(horizontal = 8.dp)
                                        ) { Text("Add") }
                                    }
                                }
                            }
                            Divider(modifier = Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha=0.3f))
                        }
                    }
                } else if (searchQuery.length > 2) {
                    Text("No one found.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}
