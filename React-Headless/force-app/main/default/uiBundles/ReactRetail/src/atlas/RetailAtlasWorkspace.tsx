import RetailToday from './retailToday';
import RetailCustomer from './retailCustomer';
import { Journey, Prospecting, Relationships } from './retailRelationships';
import Growth from './retailGrowth';
import { Health, Intelligence } from './retailWatch';
import Workbench from './retailWorkbench';
import { RetailActions } from './retailUi';
import './retailAtlas.css';

const pages = {
  client: RetailCustomer,
  relationships: Relationships,
  journey: Journey,
  prospecting: Prospecting,
  growth: Growth,
  intelligence: Intelligence,
  health: Health,
  work: Workbench,
};

export default function RetailAtlasWorkspace({ page, ownerId, ownerName, actorScope }: {
  page: string;
  ownerId: string;
  ownerName?: string;
  actorScope?: string;
}) {
  const Page = pages[page as keyof typeof pages];
  return <div className={`atlas-retail-workspace page-${page}`}>
    <RetailActions key={`${actorScope ?? ''}:${ownerId}`} actor={actorScope} owner={ownerId} ownerName={ownerName}>
      {Page ? <Page ownerId={ownerId} ownerName={ownerName} /> : <RetailToday ownerId={ownerId} />}
    </RetailActions>
  </div>;
}
