CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`public` integer DEFAULT 0 NOT NULL,
	`phase` text NOT NULL,
	`updated` integer NOT NULL
);

CREATE INDEX `rooms_match` ON `rooms` (`public`,`phase`,`updated`);
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

CREATE INDEX `results_player_outcome` ON `match_results` (`player_id`,`outcome`);
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

CREATE INDEX `matches_finished` ON `matches` (`status`,`completed_at`);
CREATE INDEX `matches_room` ON `matches` (`room_code`);
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);


