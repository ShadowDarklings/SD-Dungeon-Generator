# SD Dungeon Generator

Team: ShadowDarklings. 
Members: 
--Megan (server-side), 
--Charles (client-side), 
--Mario (database and security). 
Project: SD Dungeon Generator is a web app for creating and exploring Shadowdark-inspired procedural dungeons. 

A user selects a dungeon level, generates a gridded dungeon map, begins in an entrance room under fog of war, and reveals rooms, doors, monsters, treasure, and traps as they explore. The app is for Shadowdark RPG players who want a solo dungeon-delving tool or a quick dungeon generator when they do not have a Dungeon Master available.

MVP: In version 1, the site will generate a random square-grid dungeon with rooms, hallways, doors, rock/wall space, a starting room, fog of war, and simple click-to-reveal exploration. 

Dungeon level 1-10 will affect JSON-based random tables for room contents, encounters, treasure, traps, and door states. 

The first version will prioritize a working playable map, readable generated room data, and deployment to AWS; player accounts, saved games, real-time torch tracking, curved rooms, advanced line-of-sight, and expanded procedural art are stretch goals if time allows.

External APIs: Our main external platform will be AWS, likely using static hosting through Amplify or S3/CloudFront and, if time allows, API Gateway/Lambda/DynamoDB for save files. 
Our backup is a static client-only version that uses local JSON data and browser localStorage, which avoids auth, rate limits, and free-tier database concerns. 

Why this project? 
We are excited because it combines game design, procedural generation, data modeling, frontend interaction, backend deployment, and security decisions in one project. 
It also has real audience potential: tabletop RPG players don't currently have a website that can act as an automated DM. This fills that niche and could grow beyond the class into a larger public-funded dungeon generator for solo or DM-less TTRPG play.
