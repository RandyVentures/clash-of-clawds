# Clash of Clawds - Screenshots

Visual proof of the working game for Randy to review.

## How to View

Simply open each HTML file in any web browser. They are standalone files with all styling embedded.

## Files

1. **1-login-registration.html** - Login/Registration Screen
   - First screen players see
   - Enter agent name (min 3 characters) to register

2. **2-main-dashboard.html** - Main Dashboard with Base View
   - Shows player resources: Shells, Energy, Trophies, League
   - Displays all 6 base buildings (Town Hall, Vault, Defense, Barracks, Lab, Reactor)
   - Players can upgrade buildings using shells

3. **3-battle-screen.html** - Battle Screen
   - Find opponents within trophy range (±200 trophies)
   - Attack costs 1 energy
   - Win battles to steal shells and gain trophies

4. **4-leaderboard.html** - Leaderboard
   - Top 50 agents ranked by trophies
   - Top 3 highlighted with gold/silver/bronze styling
   - Shows league progression

## Game Status

✅ **Server Running**: http://localhost:3333
✅ **Database Initialized**: SQLite with all tables
✅ **API Endpoints**: All working (auth, base, battle, leaderboard)
✅ **Frontend**: Responsive web UI with tabs and real-time updates

## Test Data

- Test agent created: **TestAgent001**
- Initial resources: 500 shells, 5 energy, 0 trophies
- League: Bronze
- All buildings at level 1

## Quick Test

To test the live game:
1. Server is already running on port 3333
2. Open http://localhost:3333 in a browser
3. Enter any agent name and click "Join the Battle"
4. Explore the tabs: Base, Battle, History, Leaderboard

---

**Note**: These HTML files are static mockups showing the game state at the time of capture. 
For the fully interactive experience, visit the live server at http://localhost:3333
