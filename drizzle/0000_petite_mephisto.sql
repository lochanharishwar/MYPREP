CREATE TABLE `context_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`site` text NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL
);
