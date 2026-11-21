# CLAUDE.md — Hackathon Project Overview

## Context & Goal

We are building a **mobile-first Next.js web application** as part of a hackathon. While the concept is a mobile app, for now it is a Next.js website designed specifically to be opened and used in a mobile phone browser.

Because we are limited in time, our top priority is building the **simplest possible working MVP**.

## Core Features & Screens

1. **Spotify Connection & User Profile**
   * Users connect their Spotify account to get started.

2. **Summary Page (MVP 1)**
   * Displays what the user listened to recently and their general listening trends.
   * Highlights the user's AI-generated **"vibe"**.
   * Includes a **Share** button to share the summary to a story.
   * Displays **concert recommendations**.

3. **Listening Screen (MVP 2)**
   * Shows people nearby and what they are listening to (either right now or recently).
   * **Stretch Goal:** Recommend people with similar music taste.

4. **Chat (MVP 2)**
   * Enables chatting with people you reached out to from the Listening screen.

## High-Level Data & System Flow

* **Spotify Sync & Storage:** Fetch listening data from Spotify and store it per user.
* **LLM Analysis:** Run LLM analysis on recent listening trends from time to time to generate insights and "vibe" summaries for the Summary page.
* **Taste Matching (Stretch Goal):** Suggesting people with similar tastes may require a graph database.

## Work Directions

Development is split across four main areas:
* **Import + storage** (fetching and persisting Spotify data per user)
* **LLM analysis** (generating trends/vibe summaries)
* **User profile** (Spotify login, user state, basic profile)
* **Chat** (messaging people discovered on the Listening screen)

## Hackathon Guidelines for Claude

* **Keep it simple:** Always choose the fastest, simplest working solution over complex architecture or abstractions.
* **Mobile browser first:** Build all layouts and interactions specifically for a phone screen viewport.
* **Ask before over-engineering:** Keep dependencies minimal and check before introducing heavy infrastructure.