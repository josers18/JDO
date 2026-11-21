/** The greeting addresses the signed-in banker even when viewing another book. */
export function AtlasGreeting({ name }: { name?: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = name?.trim().split(/\s+/)[0];
  return <p className="atlas-greeting">{greeting}{first && <>, <strong>{first}</strong></>}</p>;
}
