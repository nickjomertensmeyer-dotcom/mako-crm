export default async function PaymentResult({searchParams}:{searchParams:Promise<{result?:string}>}){
 const {result}=await searchParams;
 return <main className="auth-shell"><section className="panel"><h1>{result==='submitted'?'Payment submitted':'Checkout closed'}</h1><p>{result==='submitted'?'The business will receive confirmation from Stripe when your payment succeeds. Some payment methods take longer to confirm.':'If you did not complete payment, you can return to the payment link provided by the business.'}</p><p>You can close this page. Contact the business directly with questions about your invoice.</p></section></main>;
}
