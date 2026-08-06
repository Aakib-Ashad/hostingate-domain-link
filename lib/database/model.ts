import { Database } from "./database";


export type Offer = Database["public"]["Tables"]["domin_bidders"]["Row"];
export type CreateOffer = Database["public"]["Tables"]["domin_bidders"]["Insert"];
