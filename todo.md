X Early Bird - Be the first team to fully register for the season.
X Close Call - Be the last team to fully register for the season.
X Pillar of Community - Start the season with the most karma.
X Private Property - Start the season with zero karma.
X Welcome - Start the season as a new team.
X Veteran - Start the season as a rolled over team.
X Thin Ice - Roster a previously banned or suspended player.
X Schooled - Lose to a team of high schoolers.
X Imposters - Caught with a player changing their name.
X Merciless - Beat a team by 15 points.
X Speedrun - Participate in a game with at least 27 points scored.
Just Warming Up - Score 5 or fewer points in a game.
Show Off - Score 18 or more points in a game.
Streaker - Win 10 games in a row.
Also a Streaker - Lose 10 games in a row.
Consistent - Score the same number of points twice in one night.
Dishonor - Forfeit a game.
Usurpers - Roll over a team and have no previous captains.
Kings of the North - Have the top ranked player on your team after the season starts.
Addicted - Team exists for 3 seasons in a row.
Dinosaurs - Team has competed in 10 different seasons.
Forefathers - Team played in the inaugural season.
20XX - Play in the 20XX Season.
Improvement - Place higher than you did last season.
Growing Pains - Place lower than you did last season.

---

---

---

update the onTeamRegistrationChange firebase function so that it also changes the SeasonDocument to be in a registered state, so that all new Players created past that point will have "lookingForTeam" set to true. Before that point, all players created will have "lookingForTeam" set to false.

update the onTeamRegistrationChange firebase function so that it also deletes all the other teams that are not fully registered. There should only be the 12 fully registered teams left in the current season after this function runs. All the players on those deleted teams should have their "lookingForTeam" value set to true, of course. But they should be treated as if they just left a team, so their team ref in their player document PlayerSeason for the current season should be set to null.

Check to see if we can consolidate "lookingForTeam" and "locked" into one. See if we're able to create a missing value of "lookingForTeam" as undefined, so it's different than "false". Unless it doesn't actually matter, because if undefined is treated as false, then none of those players being added to teams will actually even affect karma gains.

Update the firebase function that the PlayerRegistrationStatus component page calls so that it also returns the "lookingForTeam" value for each player, and then also show an indicator of whether or not each player is rostered on a fully registered team. Have the firebase function return this data, and also update the PlayerRegistrationStatus component to show this data.

Create a firebase function that can be called from the admin UI to take a backup of the entire firestore database and save it to a new file in the storage bucket. The file should be named with the current date and time, like "backup-YYYY-MM-DD-HH-MM-SS.json". This function should be callable from the admin UI, and should show a loading indicator while it's running, and then show a success message when it's done, or an error message if it fails. There should also be a list of previous backups with the date and time they were created, and a button to download each backup file.

Create a firebase function that can be called from the admin UI to restore the entire firestore database from a backup file in the storage bucket. This function should take the name of the backup file as a parameter, and should show a loading indicator while its running, and then show a success message when its done, or an error message if it fails. There should also be a list of previous backups with the date and time they were created, and a button to restore from each backup file.

Show karma on the badges section still.

There is a heavy refactor that I want to do. Right now, in the Teams firestore collection, we have a document for every unique instance of a
team. And we have a "teamID" field in the Team document which helps us know if a team has continuity between seasons. I've been toying around
with the idea of refactoring our system so that each unique team document in the Teams firestore collection represents an entirely different
team, and if there are instances of teams carrying over between seasons, then that would be reflected within the team document. Because right
now I think the system design is limiting ourselves. I think each Team document should be a unique team, and we can have each document have an
array or map field that keeps track of all the seasons in which the team participates. The idea isn't fully fleshed out, but that's the gist of
what I'm thinking. I want to do this because I think it will make it easier to tracking Badges awarded to teams throughout the history of the
team across seasons. What do you think? Can you think of any system design improvements of this nature? I understand that a lot of our firebase
functions and our application logic for the react web application would need to be refactored.

Which one follows Firebase Firestore industry standards and best practices?

What other changes and optimizations should we do to our data structure models in Firestore and in the application so that we're following
Firestore and Firebase best practices and industry standards? Please analyze and audit all of our collections and document structures.

How would you go about migrating the data to the new structure?

Update the package.json run script commands to only have one single set of test data, which is a copy of up-to-date production data.

Add e2e tests that can ideally run with firebae emulator suite.

---

Do you understand? I want to prioritize user experience, accessibility, responsivness, industry standards, and best practices.

For things that are fully deprecated and no longer used, can we just delete them from our code base to clean things up? I want to make sure that we fully remove obsolete, unneccessary, redundant, oudated, legacy code that isn't being used. I also want to ensure that we have files and code organized, structured, and named in a way that makes sense.

Please commit all of our changes with a meaningful commit message and then push them to the remote branch.

Please ensure that this local branch is up-to-date with remote branch. Then, commit all of our changes with meaningful commit messages and then push them to the "main" remote branch. Ensure there are no emojis or mentions of Claude Code in the commit message(s).

Perform a comprehensive audit and analysis of the code base and let me know if you spot any potential issues/problems/bugs or areas for improvement.

2. Add waiver history UI - The new subcollection pattern makes it easy to show users their waiver history across seasons
3. Add admin waiver management - Consider adding admin functions to:
   - View all pending waivers across users
   - Manually mark waivers as signed (for edge cases)
   - Cancel/resend waivers

4. Waiver expiration - Consider adding expiration logic for pending waivers (e.g., 30 days) to clean up stale requests
5. Tests - Add unit tests for:
   - dropboxSignWebhook - validate signature, metadata extraction, status updates
   - onPaymentCreated - waiver creation with metadata
   - dropboxSignSendReminderEmail - rate limiting, authorizationzz

| Function      | File                   | Change                                                         |
| ------------- | ---------------------- | -------------------------------------------------------------- |
| Team create   | create.ts              | Allow before registration opens, block after registration ends |
| Team rollover | rollover.ts            | Allow before registration opens, block after registration ends |
| Team delete   | delete.ts              | Block after registration ends (was: season start)              |
| Manage player | managePlayer.ts        | Block after registration ends (was: season start)              |
| Create offer  | offers/create.ts       | Block after registration ends (was: season start)              |
| Update offer  | offers/updateStatus.ts | Block after registration ends (was: season start)              |
