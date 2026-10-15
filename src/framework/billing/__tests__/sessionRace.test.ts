import { BillingStore } from '../billingStore';
import type { BillingGateway, BillingState } from '../../contracts';
const state: BillingState = {isConfigured:true,isVerified:true,hasEntitlement:false,
  entitlementId:'pro',creditBalance:2,activeProductIds:[],purchasedProductIds:[],checkedAt:1};
function deferred<T>() {
  let resolve!: (value:T)=>void;
  const promise = new Promise<T>(r=>{resolve=r;});
  return {promise,resolve};
}
test.each(['refresh','restore','purchase'] as const)('ignores %s results after account switches', async method => {
  const pending = deferred<BillingState>();
  const started = deferred<void>();
  const wait = () => {started.resolve();return pending.promise;};
  const gateway: BillingGateway = {
    configure:async()=>true,identify:async()=>{},getState:async()=>state,
    getProducts:async()=>[],restore:wait,
    purchase:async()=>({status:'purchased',state:await wait()}),logOut:async()=>{}
  };
  const save = jest.fn(async()=>{});
  const store = new BillingStore(gateway,{get:async()=>null,save,clear:async()=>{}},
    {captureException:()=>{},addBreadcrumb:()=>{},setUser:()=>{}});
  await store.start('alice');
  gateway.getState = wait;
  const operation = method==='purchase' ? store.purchase({id:'p',packageId:'p',title:'',description:'',priceLabel:'',kind:'subscription'}) : store[method]();
  const rejection = expect(operation).rejects.toThrow('account changed');
  await started.promise;
  const switched = store.start('bob');
  gateway.getState = async()=>({...state,creditBalance:8});
  pending.resolve(state);
  await rejection;
  await switched;
  expect(store.getSnapshot().value?.creditBalance).toBe(8);
  expect(save.mock.calls.length).toBe(2);
});
