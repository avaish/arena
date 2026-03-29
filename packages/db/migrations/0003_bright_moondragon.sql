PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`webauthn_user_id` text,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_passkey`("id", "name", "public_key", "user_id", "credential_id", "webauthn_user_id", "counter", "device_type", "backed_up", "transports", "created_at", "aaguid") SELECT "id", "name", "public_key", "user_id", "credential_id", "webauthn_user_id", "counter", "device_type", "backed_up", "transports", "created_at", "aaguid" FROM `passkey`;--> statement-breakpoint
DROP TABLE `passkey`;--> statement-breakpoint
ALTER TABLE `__new_passkey` RENAME TO `passkey`;--> statement-breakpoint
PRAGMA foreign_keys=ON;