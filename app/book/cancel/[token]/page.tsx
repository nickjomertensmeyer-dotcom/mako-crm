import {CancelBooking} from '@/components/public-booking';
export default async function Page({params}:{params:Promise<{token:string}>}){return <CancelBooking token={(await params).token}/>;}
