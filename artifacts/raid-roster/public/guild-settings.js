// Only retry this idempotent details update, never credential rotation or deletion.
export async function saveGuildDetails(request, guild, details) {
  const options = {
    method: 'POST',
    body: JSON.stringify({ ...details, expectedGuildId: guild.id }),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await request('/api/guild', options);
    } catch (error) {
      if (!(error instanceof TypeError) && error.name !== 'AbortError') throw error;
      let current;
      try { current = (await request('/api/guild'))?.guild; } catch (confirmationError) {
        if (confirmationError.status >= 400 && confirmationError.status < 500) throw confirmationError;
        // An unavailable read cannot confirm whether the write reached the server.
      }
      if (current && current.id !== guild.id) {
        throw new Error('You are signed in to a different guild. Reload before saving settings.');
      }
      if (current?.name === details.name && current?.faction === details.faction) {
        return { guild: current, invalidRaces: [], confirmedAfterReconnect: true };
      }
      if (attempt === 1) {
        throw new Error('Could not confirm the save. Check your connection, then reload to check the saved faction before trying again.');
      }
    }
  }
}
