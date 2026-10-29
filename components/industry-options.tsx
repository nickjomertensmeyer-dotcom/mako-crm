import {businessTypes,industryGroups} from '@/lib/presets';
export function IndustryOptions(){return <>{industryGroups.map(group=><optgroup key={group} label={group}>{businessTypes.filter(type=>type.group===group).map(type=><option key={type.name} value={type.name}>{type.name}</option>)}</optgroup>)}</>;}
