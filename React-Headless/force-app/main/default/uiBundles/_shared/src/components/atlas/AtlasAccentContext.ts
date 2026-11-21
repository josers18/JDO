import { createContext } from 'react';

export const atlasAccents = { retail: '#366887', wealth: '#816d48', commercial: '#4c7062' } as const;
export const AtlasAccentContext = createContext<{ actorScope: string | null }>({ actorScope: null });
