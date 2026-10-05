import { createRedisClient } from '../../lib/roster/src/guild-redis.js';
import { migrateGoodJob } from '../../lib/roster/src/guild-migration.js';

// Deliberately manual. Run in a private terminal and save the output immediately.
// Normal web-server logs must never contain these credentials.
try {
  const result = await migrateGoodJob(createRedisClient());
  if (result.alreadyMigrated) {
    process.stdout.write(`Good Job has already been migrated at /g/${result.slug}. Credentials cannot be retrieved again.\n`);
  } else {
    process.stdout.write([
      'Good Job migration complete. Original Redis data is unchanged.',
      `Guild path: /g/${result.guild.slug}`,
      `Imported: ${result.memberCount} members and ${result.splitCount} split setups.`,
      'ONE-TIME CREDENTIALS — save privately now:',
      `Guild key: ${result.key}`,
      `Recovery code: ${result.recoveryCode}`,
      'These plaintext credentials are not saved on the server. Losing both means the guild cannot be recovered.',
      '',
    ].join('\n'));
  }
} catch (error) {
  process.stderr.write(`${error.status ? error.message : 'Migration failed. The live database must be checked before retrying.'}\n`);
  process.exitCode = 1;
}