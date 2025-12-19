package app.stifle.ui.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.SupervisedUserCircle // Groups icon
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NamedNavArgument
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument // Added importntBackStackEntryAsState
import app.stifle.data.AppContainer
import app.stifle.ui.screens.FriendsScreen
import app.stifle.ui.screens.GroupsScreen
import app.stifle.ui.screens.HomeScreen
import app.stifle.ui.screens.LoginScreen
import app.stifle.ui.screens.OnboardingScreen
import app.stifle.ui.screens.RegisterScreen
import app.stifle.ui.screens.SettingsScreen
import kotlinx.coroutines.launch

@Composable
fun StifleNavHost(
    container: AppContainer,
    startDestination: String
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    
    val onLogout: () -> Unit = {
        navController.navigate("login") {
            popUpTo(0) { inclusive = true }
        }
    }
    
    // Screens that show the bottom bar
    val showBottomBar = currentRoute == "home" || currentRoute == "friends" || currentRoute?.startsWith("groups") == true
    
    Scaffold(
        bottomBar = {
            AnimatedVisibility(
                visible = showBottomBar,
                enter = slideInVertically(initialOffsetY = { it }),
                exit = slideOutVertically(targetOffsetY = { it })
            ) {
                NavigationBar {
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                        label = { Text("Home") },
                        selected = currentRoute == "home",
                        onClick = {
                            navController.navigate("home") {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.SupervisedUserCircle, contentDescription = "Groups") },
                        label = { Text("Groups") },
                        selected = currentRoute == "groups",
                        onClick = {
                            navController.navigate("groups") {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Person, contentDescription = "Friends") },
                        label = { Text("Friends") },
                        selected = currentRoute == "friends",
                        onClick = {
                            navController.navigate("friends") {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
            // We apply padding only if bottom bar is present to avoid double padding if screens handle it,
            // BUT screens like HomeScreen use Scaffold which handles padding.
            // Actually, in standard Compose, if we nest Scaffolds, the inner Scaffold handles the padding provided by outer Scaffold?
            // No, inner content should consume padding.
            // However, our Screens (Home, Friends, Groups) ARE Scaffolds.
            // A common pattern is: Outer Scaffold has BottomBar. Inner content is NavHost.
            // Route composable calls Screen(modifier = Modifier.padding(innerPadding)).
            // But our Screens don't take a Modifier for padding, they ARE whole screens.
            // If I pass 'innerPadding' to them, they need to apply it.
            // Since I cannot change every screen signature to accept modifier right now easily (I can, but...),
            // I will wrap the Route content in a Box that applies padding?
            // NO, `NavigationBar` height is consumed by `innerPadding`.
            // If I don't apply `innerPadding`, the bottom of the screen will be behind the navbar.
            // So I MUST apply it.
            // I'll wrap the composable content in a Box with padding for the bottom bar routes.
            // For others (Login/Register), innerPadding is 0 anyway (no bottom bar).
             modifier = androidx.compose.ui.Modifier.padding(innerPadding)
        ) {
            composable("login") {
                LoginScreen(
                    authRepository = container.authRepository,
                    onLoginSuccess = {
                        navController.navigate("home") {
                            popUpTo("login") { inclusive = true }
                        }
                    },
                    onNavigateToRegister = {
                        navController.navigate("register")
                    }
                )
            }
            
            composable("onboarding") {
                val scope = androidx.compose.runtime.rememberCoroutineScope()
                OnboardingScreen(
                    onComplete = {
                        scope.launch {
                            container.tokenManager.setOnboardingComplete()
                        }
                        navController.navigate("register") {
                            popUpTo("onboarding") { inclusive = true }
                        }
                    }
                )
            }
            
            composable("register") {
                RegisterScreen(
                    authRepository = container.authRepository,
                    onRegisterSuccess = {
                        navController.navigate("home") {
                            popUpTo("login") { inclusive = true }
                        }
                    },
                    onNavigateBack = {
                        navController.popBackStack()
                    },
                    onNavigateToLogin = {
                        navController.navigate("login")
                    }
                )
            }
            
            composable("home") {
                HomeScreen(
                    authRepository = container.authRepository,
                    usersApi = container.usersApi,
                    onNavigateToSettings = {
                        navController.navigate("settings")
                    },
                    onLogout = onLogout
                )
            }
            
            composable("friends") {
                FriendsScreen(
                    friendsRepository = container.friendsRepository
                )
            }
            
            composable(
                route = "groups?code={code}",
                arguments = listOf(navArgument("code") { 
                    type = NavType.StringType 
                    nullable = true 
                    defaultValue = null
                })
            ) { backStackEntry ->
                val joinCode = backStackEntry.arguments?.getString("code")
                GroupsScreen(
                    groupRepository = container.groupRepository,
                    initialJoinCode = joinCode // Need to update GroupsScreen signature
                )
            }
            
            composable("settings") {
            SettingsScreen(
                usersApi = container.usersApi,
                friendsRepository = container.friendsRepository,
                tokenManager = container.tokenManager,
                onNavigateBack = {
                    navController.popBackStack()
                },
                onLogout = onLogout
            )
        }
        }
    }
}
