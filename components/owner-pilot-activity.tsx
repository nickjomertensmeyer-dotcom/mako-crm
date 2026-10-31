import {identity} from '@/lib/workspace';
import {PilotActivityDashboard} from './pilot-activity-dashboard';
export async function OwnerPilotActivity(){
 const {client}=await identity();const {data,error}=await client.rpc('owner_pilot_activity');
 if(error||!data)return <section className="panel" id="pilot-activity"><h2>Pilot activity</h2><p role="alert">Activity tracking is not available yet. Apply database migration 202610310028_pilot_activity, then refresh. Invitations and workspace access are unchanged.</p></section>;
 return <PilotActivityDashboard rows={data.rows} startedAt={data.started_at}/>;
}
