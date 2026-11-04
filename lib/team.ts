export const TEAM_COOKIE='mako-team-invitation';
export const validTeamCode=(value:string)=>/^[a-f0-9]{64}$/.test(value);
