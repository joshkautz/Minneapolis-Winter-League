Create a brand new Admin Dashboard component page titled "Player Management List".....

Update the PlayerRegistrationStatus component and the getPlayerRegistrationStatus firebase function; use the client-side Firestore querying sdk for as much as possible in the React component, and then use the firebase function only to retrieve the data for Firebase Authentication email verification statuses for each user.

Prioritize best practices and user experience. Use shadcn/ui Skeleton components for loading indicators.

Right now, when I go to the "Player Registration Status" page, which loads the PlayerRegistrationStatus component, I get a message that says "No current season found.". Please fix this.

Please improve the PlayerRegistrationStatus component to be more like the EmailVerification component and PlayerManagement component in that there should be a "Search Players" component; but I want it to filter the players displayed in the large list. But please make there be two card grid items side-by-side the same way as the other components, using the Grid component.

Now, add an Alert component at the top of the page just like we do in the EmailVerification and PlayerManagement components. Add any relevant information to the Alert component for any information of which the admin user should be wary.

Now remove all of the statistics cards, because I don't care about them and they take up space. And make the email column much less wide. Truncate it. Also truncate names that take too much length. And remove the columns for "team status" and "status"

Please use the shadcn/ui Skeleton component so that the UI appears pretty consistent throughout the process of loading all the pieces of data in thie PlayerRegistrationStatus component. Handle the authenticatino and data loading within the PageContainer component.

The getEmailVerificationStatuses firebase function appears to be getting called twice from the PlayerRegistrationStatus component.

Do not use the useRef hook. Handle all of this with useState and normal state management best practices. useRef is hacky and wrong. Use the skeleton on the "email verified" column for each player until the firebase function returns the actual value.

---

-- Traveling Trophy

Early Bird -- Be the first team to fully register for the season.
Close Call -- Be the last team to fully register for the season.
Pillar of Community -- Start the season with the most karma.
Private Property -- Start the season with zero karma.
Welcome -- Start the season as a new team.
Veteran -- Start the season as a rolled over team.
Thin Ice -- Roster a previously banned or suspended player.
Schooled -- Lose to a team of high schoolers.
Imposters -- Caught with a player changing their name.
Merciless - Beat a team by 15 points.
Speedrun - Participate in a game with at least 27 points scored.
Just Warming Up - Score 5 or fewer points in a game.
Show Off - Score 18 or more points in a game.
Streaker - Win 10 games in a row.
Also a Streaker - Lose 10 games in a row.
Consistent - Score the same number of points twice in one night.
Dishonor - Forfeit a game.
Usurpers - Roll over a team and have no previous captains.
Kings of the North - Have the top ranked player on your team after the season starts.
