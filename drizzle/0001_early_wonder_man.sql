CREATE TABLE `match_results` (
	`match_id` text NOT NULL,
	`player_id` text NOT NULL,
	`display_name` text NOT NULL,
	`outcome` text NOT NULL,
	`lives` integer NOT NULL,
	`rounds_played` integer DEFAULT 0 NOT NULL,
	`tricks_won` integer DEFAULT 0 NOT NULL,
	`exact_predictions` integer DEFAULT 0 NOT NULL,
	`prediction_error` integer DEFAULT 0 NOT NULL,
	`finalized_at` integer,
	PRIMARY KEY(`match_id`, `player_id`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `results_player_outcome` ON `match_results` (`player_id`,`outcome`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`status` text NOT NULL,
	`public` integer NOT NULL,
	`player_count` integer NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`winner_id` text,
	`rounds` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`winner_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `matches_finished` ON `matches` (`status`,`completed_at`);--> statement-breakpoint
CREATE INDEX `matches_room` ON `matches` (`room_code`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
-- Requested fresh start: discard existing lobbies and game state.
DELETE FROM rooms;
