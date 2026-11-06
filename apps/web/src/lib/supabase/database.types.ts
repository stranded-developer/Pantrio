
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor": string | null,"after": Json | null,"at": string,"before": Json | null,"entity": string,"entity_id": string | null,"id": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"entity": string,"entity_id"?: string | null,"id"?: string,"org_id": string
                  }
                  Update: {
                    "action"?: string,"actor"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"entity"?: string,"entity_id"?: string | null,"id"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"dining_tables": {
                  Row: {
                    "active": boolean,"area_id": string,"created_at": string,"h": number,"id": string,"name": string,"org_id": string,"outlet_id": string,"seats": number,"shape": Database["public"]['Enums']["table_shape"],"w": number,"x": number,"y": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"area_id": string,"created_at"?: string,"h"?: number,"id"?: string,"name": string,"org_id": string,"outlet_id": string,"seats"?: number,"shape"?: Database["public"]['Enums']["table_shape"],"w"?: number,"x"?: number,"y"?: number
                  }
                  Update: {
                    "active"?: boolean,"area_id"?: string,"created_at"?: string,"h"?: number,"id"?: string,"name"?: string,"org_id"?: string,"outlet_id"?: string,"seats"?: number,"shape"?: Database["public"]['Enums']["table_shape"],"w"?: number,"x"?: number,"y"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "dining_tables_area_id_org_id_fkey"
      columns: ["area_id","org_id"]
isOneToOne: false
      referencedRelation: "floor_areas"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "dining_tables_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dining_tables_outlet_id_org_id_fkey"
      columns: ["outlet_id","org_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"discount_items": {
                  Row: {
                    "discount_id": string,"menu_item_id": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "discount_id": string,"menu_item_id": string,"org_id": string
                  }
                  Update: {
                    "discount_id"?: string,"menu_item_id"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "discount_items_discount_id_org_id_fkey"
      columns: ["discount_id","org_id"]
isOneToOne: false
      referencedRelation: "discounts"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "discount_items_menu_item_id_org_id_fkey"
      columns: ["menu_item_id","org_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"discounts": {
                  Row: {
                    "active": boolean,"all_items": boolean,"created_at": string,"created_by": string | null,"ends_on": string | null,"id": string,"kind": Database["public"]['Enums']["discount_kind"],"name": string,"org_id": string,"starts_on": string,"value": number,"weekdays": (number)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"all_items"?: boolean,"created_at"?: string,"created_by"?: string | null,"ends_on"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["discount_kind"],"name": string,"org_id": string,"starts_on": string,"value": number,"weekdays"?: (number)[] | null
                  }
                  Update: {
                    "active"?: boolean,"all_items"?: boolean,"created_at"?: string,"created_by"?: string | null,"ends_on"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["discount_kind"],"name"?: string,"org_id"?: string,"starts_on"?: string,"value"?: number,"weekdays"?: (number)[] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "discounts_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"external_menu_items": {
                  Row: {
                    "active": boolean,"category": string | null,"connection_id": string,"external_id": string,"id": string,"name": string,"org_id": string,"recipe_id": string | null,"selling_price": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"category"?: string | null,"connection_id": string,"external_id": string,"id"?: string,"name": string,"org_id": string,"recipe_id"?: string | null,"selling_price": number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"category"?: string | null,"connection_id"?: string,"external_id"?: string,"id"?: string,"name"?: string,"org_id"?: string,"recipe_id"?: string | null,"selling_price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "external_menu_items_connection_id_org_id_fkey"
      columns: ["connection_id","org_id"]
isOneToOne: false
      referencedRelation: "pos_connections"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "external_menu_items_recipe_id_org_id_fkey"
      columns: ["recipe_id","org_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"fixed_cost_actuals": {
                  Row: {
                    "amount": number,"created_at": string,"fixed_cost_id": string,"id": string,"month": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"fixed_cost_id": string,"id"?: string,"month": string,"org_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"fixed_cost_id"?: string,"id"?: string,"month"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixed_cost_actuals_fixed_cost_id_org_id_fkey"
      columns: ["fixed_cost_id","org_id"]
isOneToOne: false
      referencedRelation: "fixed_costs"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"fixed_cost_rates": {
                  Row: {
                    "amount": number,"created_at": string,"effective_from": string,"fixed_cost_id": string,"id": string,"org_id": string,"period": Database["public"]['Enums']["cost_period"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"effective_from": string,"fixed_cost_id": string,"id"?: string,"org_id": string,"period"?: Database["public"]['Enums']["cost_period"]
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"effective_from"?: string,"fixed_cost_id"?: string,"id"?: string,"org_id"?: string,"period"?: Database["public"]['Enums']["cost_period"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixed_cost_rates_fixed_cost_id_org_id_fkey"
      columns: ["fixed_cost_id","org_id"]
isOneToOne: false
      referencedRelation: "fixed_costs"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"fixed_costs": {
                  Row: {
                    "active": boolean,"category": Database["public"]['Enums']["fixed_cost_category"],"created_at": string,"id": string,"name": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"category": Database["public"]['Enums']["fixed_cost_category"],"created_at"?: string,"id"?: string,"name": string,"org_id": string
                  }
                  Update: {
                    "active"?: boolean,"category"?: Database["public"]['Enums']["fixed_cost_category"],"created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixed_costs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"floor_areas": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"org_id": string,"outlet_id": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"org_id": string,"outlet_id": string,"sort"?: number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string,"outlet_id"?: string,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "floor_areas_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "floor_areas_outlet_id_org_id_fkey"
      columns: ["outlet_id","org_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"ingredient_conversions": {
                  Row: {
                    "equals_qty": number,"equals_unit": Database["public"]['Enums']["unit_code"],"id": string,"ingredient_id": string,"org_id": string,"qty": number,"unit": Database["public"]['Enums']["unit_code"]
                  }
                  ComputedFields: never
                  Insert: {
                    "equals_qty": number,"equals_unit": Database["public"]['Enums']["unit_code"],"id"?: string,"ingredient_id": string,"org_id": string,"qty": number,"unit": Database["public"]['Enums']["unit_code"]
                  }
                  Update: {
                    "equals_qty"?: number,"equals_unit"?: Database["public"]['Enums']["unit_code"],"id"?: string,"ingredient_id"?: string,"org_id"?: string,"qty"?: number,"unit"?: Database["public"]['Enums']["unit_code"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingredient_conversions_ingredient_id_org_id_fkey"
      columns: ["ingredient_id","org_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"ingredient_products": {
                  Row: {
                    "active": boolean,"brand": string | null,"created_at": string,"id": string,"ingredient_id": string,"name": string,"org_id": string,"pack_qty": number,"pack_unit": Database["public"]['Enums']["unit_code"],"sku": string | null,"source_url": string | null,"supplier_id": string | null,"updated_at": string,"yield_bps": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"brand"?: string | null,"created_at"?: string,"id"?: string,"ingredient_id": string,"name": string,"org_id": string,"pack_qty": number,"pack_unit": Database["public"]['Enums']["unit_code"],"sku"?: string | null,"source_url"?: string | null,"supplier_id"?: string | null,"updated_at"?: string,"yield_bps"?: number
                  }
                  Update: {
                    "active"?: boolean,"brand"?: string | null,"created_at"?: string,"id"?: string,"ingredient_id"?: string,"name"?: string,"org_id"?: string,"pack_qty"?: number,"pack_unit"?: Database["public"]['Enums']["unit_code"],"sku"?: string | null,"source_url"?: string | null,"supplier_id"?: string | null,"updated_at"?: string,"yield_bps"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingredient_products_ingredient_id_org_id_fkey"
      columns: ["ingredient_id","org_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "ingredient_products_supplier_id_org_id_fkey"
      columns: ["supplier_id","org_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"ingredients": {
                  Row: {
                    "active": boolean,"category": string | null,"created_at": string,"id": string,"name": string,"notes": string | null,"org_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"category"?: string | null,"created_at"?: string,"id"?: string,"name": string,"notes"?: string | null,"org_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"category"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"org_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingredients_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"member_pins": {
                  Row: {
                    "org_id": string,"pin_hash": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "org_id": string,"pin_hash": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "org_id"?: string,"pin_hash"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_pins_org_id_user_id_fkey"
      columns: ["org_id","user_id"]
isOneToOne: true
      referencedRelation: "org_members"
      referencedColumns: ["org_id","user_id"]
    }
                  ]
                },"menu_categories": {
                  Row: {
                    "active": boolean,"id": string,"name": string,"org_id": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"id"?: string,"name": string,"org_id": string,"sort"?: number
                  }
                  Update: {
                    "active"?: boolean,"id"?: string,"name"?: string,"org_id"?: string,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_categories_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_items": {
                  Row: {
                    "active": boolean,"category_id": string,"cost_updated_at": string | null,"created_at": string,"id": string,"image_url": string | null,"name": string,"org_id": string,"price": number,"recipe_id": string | null,"sku": string | null,"unit_cost": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"category_id": string,"cost_updated_at"?: string | null,"created_at"?: string,"id"?: string,"image_url"?: string | null,"name": string,"org_id": string,"price": number,"recipe_id"?: string | null,"sku"?: string | null,"unit_cost"?: number | null
                  }
                  Update: {
                    "active"?: boolean,"category_id"?: string,"cost_updated_at"?: string | null,"created_at"?: string,"id"?: string,"image_url"?: string | null,"name"?: string,"org_id"?: string,"price"?: number,"recipe_id"?: string | null,"sku"?: string | null,"unit_cost"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_items_category_id_org_id_fkey"
      columns: ["category_id","org_id"]
isOneToOne: false
      referencedRelation: "menu_categories"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "menu_items_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_items_recipe_id_org_id_fkey"
      columns: ["recipe_id","org_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "added_by": string | null,"discount_id": string | null,"discount_name": string | null,"id": string,"line_discount": number,"line_subtotal": number,"menu_item_id": string | null,"modifiers_json": NonNullable<Json>,"name_snapshot": string,"order_id": string,"org_id": string,"qty": number,"round_id": string | null,"unit_cost": number | null,"unit_price": number,"void_reason": string | null,"voided": boolean,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"discount_id"?: string | null,"discount_name"?: string | null,"id"?: string,"line_discount"?: number,"line_subtotal": number,"menu_item_id"?: string | null,"modifiers_json"?: NonNullable<Json>,"name_snapshot": string,"order_id": string,"org_id": string,"qty": number,"round_id"?: string | null,"unit_cost"?: number | null,"unit_price": number,"void_reason"?: string | null,"voided"?: boolean,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "added_by"?: string | null,"discount_id"?: string | null,"discount_name"?: string | null,"id"?: string,"line_discount"?: number,"line_subtotal"?: number,"menu_item_id"?: string | null,"modifiers_json"?: NonNullable<Json>,"name_snapshot"?: string,"order_id"?: string,"org_id"?: string,"qty"?: number,"round_id"?: string | null,"unit_cost"?: number | null,"unit_price"?: number,"void_reason"?: string | null,"voided"?: boolean,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_menu_item_id_org_id_fkey"
      columns: ["menu_item_id","org_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "order_items_order_id_org_id_fkey"
      columns: ["order_id","org_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "order_items_round_fk"
      columns: ["round_id","org_id"]
isOneToOne: false
      referencedRelation: "order_rounds"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"order_rounds": {
                  Row: {
                    "client_request_id": string,"created_at": string,"created_by": string,"id": string,"kitchen_done_at": string | null,"kitchen_done_by": string | null,"order_id": string,"org_id": string,"outlet_id": string,"round_no": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_request_id": string,"created_at"?: string,"created_by": string,"id"?: string,"kitchen_done_at"?: string | null,"kitchen_done_by"?: string | null,"order_id": string,"org_id": string,"outlet_id": string,"round_no": number
                  }
                  Update: {
                    "client_request_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"kitchen_done_at"?: string | null,"kitchen_done_by"?: string | null,"order_id"?: string,"org_id"?: string,"outlet_id"?: string,"round_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_rounds_order_id_org_id_fkey"
      columns: ["order_id","org_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "bill_printed_at": string | null,"business_date": string,"client_request_id": string,"closed_at": string | null,"closed_by": string | null,"cost_total": number | null,"discount_total": number,"grand_total": number,"guests": number | null,"id": string,"kitchen_done_at": string | null,"kitchen_done_by": string | null,"opened_at": string,"opened_by": string,"order_no": number,"org_id": string,"outlet_id": string,"pb1_on_service": boolean,"price_mode": Database["public"]['Enums']["price_mode"],"priority": boolean,"queue_no": number | null,"service_bps": number,"service_total": number,"status": Database["public"]['Enums']["order_status"],"subtotal": number,"table_id": string | null,"tax_bps": number,"tax_total": number,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_printed_at"?: string | null,"business_date": string,"client_request_id": string,"closed_at"?: string | null,"closed_by"?: string | null,"cost_total"?: number | null,"discount_total"?: number,"grand_total"?: number,"guests"?: number | null,"id"?: string,"kitchen_done_at"?: string | null,"kitchen_done_by"?: string | null,"opened_at"?: string,"opened_by": string,"order_no": number,"org_id": string,"outlet_id": string,"pb1_on_service": boolean,"price_mode": Database["public"]['Enums']["price_mode"],"priority"?: boolean,"queue_no"?: number | null,"service_bps": number,"service_total"?: number,"status"?: Database["public"]['Enums']["order_status"],"subtotal"?: number,"table_id"?: string | null,"tax_bps": number,"tax_total"?: number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "bill_printed_at"?: string | null,"business_date"?: string,"client_request_id"?: string,"closed_at"?: string | null,"closed_by"?: string | null,"cost_total"?: number | null,"discount_total"?: number,"grand_total"?: number,"guests"?: number | null,"id"?: string,"kitchen_done_at"?: string | null,"kitchen_done_by"?: string | null,"opened_at"?: string,"opened_by"?: string,"order_no"?: number,"org_id"?: string,"outlet_id"?: string,"pb1_on_service"?: boolean,"price_mode"?: Database["public"]['Enums']["price_mode"],"priority"?: boolean,"queue_no"?: number | null,"service_bps"?: number,"service_total"?: number,"status"?: Database["public"]['Enums']["order_status"],"subtotal"?: number,"table_id"?: string | null,"tax_bps"?: number,"tax_total"?: number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_outlet_id_org_id_fkey"
      columns: ["outlet_id","org_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "orders_table_fk"
      columns: ["table_id","org_id"]
isOneToOne: false
      referencedRelation: "dining_tables"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"org_domains": {
                  Row: {
                    "created_at": string,"hostname": string,"id": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"hostname": string,"id"?: string,"org_id": string
                  }
                  Update: {
                    "created_at"?: string,"hostname"?: string,"id"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_domains_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"org_members": {
                  Row: {
                    "active": boolean,"created_at": string,"org_id": string,"role": Database["public"]['Enums']["org_role"],"role_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"org_id": string,"role"?: Database["public"]['Enums']["org_role"],"role_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"org_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"role_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_members_role_fk"
      columns: ["role_id","org_id"]
isOneToOne: false
      referencedRelation: "org_roles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"org_roles": {
                  Row: {
                    "allow_password": boolean,"created_at": string,"id": string,"name": string,"org_id": string,"permissions": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_password"?: boolean,"created_at"?: string,"id"?: string,"name": string,"org_id": string,"permissions"?: (string)[]
                  }
                  Update: {
                    "allow_password"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string,"permissions"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_roles_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"org_settings": {
                  Row: {
                    "day_cutover_hour": number,"logo_on_dark_url": string | null,"logo_url": string | null,"org_id": string,"receipt_footer": string,"receipt_header": string,"receipt_logo_url": string | null,"terminal_idle_minutes": number,"terminal_lock_after_sale": boolean,"timezone": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "day_cutover_hour"?: number,"logo_on_dark_url"?: string | null,"logo_url"?: string | null,"org_id": string,"receipt_footer"?: string,"receipt_header"?: string,"receipt_logo_url"?: string | null,"terminal_idle_minutes"?: number,"terminal_lock_after_sale"?: boolean,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "day_cutover_hour"?: number,"logo_on_dark_url"?: string | null,"logo_url"?: string | null,"org_id"?: string,"receipt_footer"?: string,"receipt_header"?: string,"receipt_logo_url"?: string | null,"terminal_idle_minutes"?: number,"terminal_lock_after_sale"?: boolean,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_settings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"currency": string,"id": string,"name": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"name": string,"slug": string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"outlets": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"org_id": string,"table_service": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"org_id": string,"table_service"?: boolean
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string,"table_service"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "outlets_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"amount_tendered": number | null,"change_given": number | null,"created_at": string,"id": string,"method": Database["public"]['Enums']["payment_method"],"order_id": string,"org_id": string,"paid_at": string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_ref": string | null,"raw_response": Json | null,"status": Database["public"]['Enums']["payment_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"amount_tendered"?: number | null,"change_given"?: number | null,"created_at"?: string,"id"?: string,"method": Database["public"]['Enums']["payment_method"],"order_id": string,"org_id": string,"paid_at"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_ref"?: string | null,"raw_response"?: Json | null,"status"?: Database["public"]['Enums']["payment_status"]
                  }
                  Update: {
                    "amount"?: number,"amount_tendered"?: number | null,"change_given"?: number | null,"created_at"?: string,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"order_id"?: string,"org_id"?: string,"paid_at"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_ref"?: string | null,"raw_response"?: Json | null,"status"?: Database["public"]['Enums']["payment_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_order_id_org_id_fkey"
      columns: ["order_id","org_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pos_connections": {
                  Row: {
                    "api_key_hash": string,"api_key_prefix": string,"created_at": string,"id": string,"name": string,"org_id": string,"provider": string,"revoked_at": string | null,"webhook_secret": string | null,"webhook_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "api_key_hash": string,"api_key_prefix": string,"created_at"?: string,"id"?: string,"name": string,"org_id": string,"provider"?: string,"revoked_at"?: string | null,"webhook_secret"?: string | null,"webhook_url"?: string | null
                  }
                  Update: {
                    "api_key_hash"?: string,"api_key_prefix"?: string,"created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string,"provider"?: string,"revoked_at"?: string | null,"webhook_secret"?: string | null,"webhook_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pos_connections_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"print_devices": {
                  Row: {
                    "created_at": string,"id": string,"last_seen_at": string | null,"name": string,"org_id": string,"outlet_id": string,"revoked_at": string | null,"token_hash": string,"token_prefix": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_seen_at"?: string | null,"name": string,"org_id": string,"outlet_id": string,"revoked_at"?: string | null,"token_hash": string,"token_prefix": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_seen_at"?: string | null,"name"?: string,"org_id"?: string,"outlet_id"?: string,"revoked_at"?: string | null,"token_hash"?: string,"token_prefix"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_devices_outlet_id_org_id_fkey"
      columns: ["outlet_id","org_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"print_jobs": {
                  Row: {
                    "attempts": number,"claimed_at": string | null,"claimed_by": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["print_kind"],"last_error": string | null,"order_id": string | null,"org_id": string,"outlet_id": string,"payload": NonNullable<Json>,"printed_at": string | null,"requested_by": string | null,"status": Database["public"]['Enums']["print_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["print_kind"],"last_error"?: string | null,"order_id"?: string | null,"org_id": string,"outlet_id": string,"payload"?: NonNullable<Json>,"printed_at"?: string | null,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["print_status"]
                  }
                  Update: {
                    "attempts"?: number,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["print_kind"],"last_error"?: string | null,"order_id"?: string | null,"org_id"?: string,"outlet_id"?: string,"payload"?: NonNullable<Json>,"printed_at"?: string | null,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["print_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_jobs_claimed_by_fkey"
      columns: ["claimed_by"]
isOneToOne: false
      referencedRelation: "print_devices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_order_id_org_id_fkey"
      columns: ["order_id","org_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "print_jobs_outlet_id_org_id_fkey"
      columns: ["outlet_id","org_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"product_prices": {
                  Row: {
                    "created_at": string,"effective_from": string,"id": string,"note": string | null,"org_id": string,"price": number,"product_id": string,"recorded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"effective_from"?: string,"id"?: string,"note"?: string | null,"org_id": string,"price": number,"product_id": string,"recorded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"effective_from"?: string,"id"?: string,"note"?: string | null,"org_id"?: string,"price"?: number,"product_id"?: string,"recorded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_prices_product_id_org_id_fkey"
      columns: ["product_id","org_id"]
isOneToOne: false
      referencedRelation: "ingredient_products"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"id": string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recipe_lines": {
                  Row: {
                    "id": string,"org_id": string,"product_id": string | null,"qty": number,"recipe_id": string,"sort": number,"sub_recipe_id": string | null,"unit": Database["public"]['Enums']["unit_code"],"waste_bps": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"org_id": string,"product_id"?: string | null,"qty": number,"recipe_id": string,"sort"?: number,"sub_recipe_id"?: string | null,"unit": Database["public"]['Enums']["unit_code"],"waste_bps"?: number
                  }
                  Update: {
                    "id"?: string,"org_id"?: string,"product_id"?: string | null,"qty"?: number,"recipe_id"?: string,"sort"?: number,"sub_recipe_id"?: string | null,"unit"?: Database["public"]['Enums']["unit_code"],"waste_bps"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_lines_product_id_org_id_fkey"
      columns: ["product_id","org_id"]
isOneToOne: false
      referencedRelation: "ingredient_products"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "recipe_lines_recipe_id_org_id_fkey"
      columns: ["recipe_id","org_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "recipe_lines_sub_recipe_id_org_id_fkey"
      columns: ["sub_recipe_id","org_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"kind": Database["public"]['Enums']["recipe_kind"],"name": string,"notes": string | null,"org_id": string,"updated_at": string,"yield_qty": number,"yield_unit": Database["public"]['Enums']["unit_code"]
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["recipe_kind"],"name": string,"notes"?: string | null,"org_id": string,"updated_at"?: string,"yield_qty"?: number,"yield_unit"?: Database["public"]['Enums']["unit_code"]
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["recipe_kind"],"name"?: string,"notes"?: string | null,"org_id"?: string,"updated_at"?: string,"yield_qty"?: number,"yield_unit"?: Database["public"]['Enums']["unit_code"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipes_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_members": {
                  Row: {
                    "created_at": string,"end_month": string | null,"id": string,"name": string,"org_id": string,"role": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_month"?: string | null,"id"?: string,"name": string,"org_id": string,"role"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"end_month"?: string | null,"id"?: string,"name"?: string,"org_id"?: string,"role"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_wages": {
                  Row: {
                    "created_at": string,"effective_from": string,"id": string,"monthly_wage": number,"org_id": string,"staff_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"effective_from": string,"id"?: string,"monthly_wage": number,"org_id": string,"staff_id": string
                  }
                  Update: {
                    "created_at"?: string,"effective_from"?: string,"id"?: string,"monthly_wage"?: number,"org_id"?: string,"staff_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_wages_staff_id_org_id_fkey"
      columns: ["staff_id","org_id"]
isOneToOne: false
      referencedRelation: "staff_members"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"notes": string | null,"org_id": string,"phone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"notes"?: string | null,"org_id": string,"phone"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"org_id"?: string,"phone"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"tax_settings": {
                  Row: {
                    "income_tax_bps": number,"income_tax_free_annual_turnover": number,"income_tax_mode": Database["public"]['Enums']["income_tax_mode"],"org_id": string,"pb1_bps": number,"pb1_on_service": boolean,"price_mode": Database["public"]['Enums']["price_mode"],"service_bps": number,"service_is_revenue": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "income_tax_bps"?: number,"income_tax_free_annual_turnover"?: number,"income_tax_mode"?: Database["public"]['Enums']["income_tax_mode"],"org_id": string,"pb1_bps"?: number,"pb1_on_service"?: boolean,"price_mode"?: Database["public"]['Enums']["price_mode"],"service_bps"?: number,"service_is_revenue"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "income_tax_bps"?: number,"income_tax_free_annual_turnover"?: number,"income_tax_mode"?: Database["public"]['Enums']["income_tax_mode"],"org_id"?: string,"pb1_bps"?: number,"pb1_on_service"?: boolean,"price_mode"?: Database["public"]['Enums']["price_mode"],"service_bps"?: number,"service_is_revenue"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tax_settings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"terminals": {
                  Row: {
                    "created_at": string,"created_by": string | null,"failed_pins": number,"hard_locked_at": string | null,"id": string,"last_seen_at": string | null,"name": string,"org_id": string,"outlet_id": string,"reset_sent_at": string | null,"revoked_at": string | null,"token_hash": string,"token_prefix": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"failed_pins"?: number,"hard_locked_at"?: string | null,"id"?: string,"last_seen_at"?: string | null,"name": string,"org_id": string,"outlet_id": string,"reset_sent_at"?: string | null,"revoked_at"?: string | null,"token_hash": string,"token_prefix": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"failed_pins"?: number,"hard_locked_at"?: string | null,"id"?: string,"last_seen_at"?: string | null,"name"?: string,"org_id"?: string,"outlet_id"?: string,"reset_sent_at"?: string | null,"revoked_at"?: string | null,"token_hash"?: string,"token_prefix"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "terminals_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "terminals_outlet_id_org_id_fkey"
      columns: ["outlet_id","org_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"time_entries": {
                  Row: {
                    "business_date": string,"clock_in_at": string,"clock_out_at": string | null,"created_at": string,"edited_at": string | null,"edited_by": string | null,"id": string,"in_photo": string | null,"note": string | null,"org_id": string,"out_photo": string | null,"outlet_id": string,"status": Database["public"]['Enums']["time_entry_status"],"terminal_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_date": string,"clock_in_at": string,"clock_out_at"?: string | null,"created_at"?: string,"edited_at"?: string | null,"edited_by"?: string | null,"id"?: string,"in_photo"?: string | null,"note"?: string | null,"org_id": string,"out_photo"?: string | null,"outlet_id": string,"status"?: Database["public"]['Enums']["time_entry_status"],"terminal_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "business_date"?: string,"clock_in_at"?: string,"clock_out_at"?: string | null,"created_at"?: string,"edited_at"?: string | null,"edited_by"?: string | null,"id"?: string,"in_photo"?: string | null,"note"?: string | null,"org_id"?: string,"out_photo"?: string | null,"outlet_id"?: string,"status"?: Database["public"]['Enums']["time_entry_status"],"terminal_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_entries_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_outlet_id_org_id_fkey"
      columns: ["outlet_id","org_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "time_entries_terminal_id_org_id_fkey"
      columns: ["terminal_id","org_id"]
isOneToOne: false
      referencedRelation: "terminals"
      referencedColumns: ["id","org_id"]
    }
                  ]
                }
          }
          Views: {
            "current_product_prices": {
                  Row: {
                    "created_at": string,"effective_from": string,"org_id": string,"price": number,"product_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "product_prices_product_id_org_id_fkey"
      columns: ["product_id","org_id"]
isOneToOne: false
      referencedRelation: "ingredient_products"
      referencedColumns: ["id","org_id"]
    }
                  ]
                }
          }
          Functions: {
            "add_time_entry":
{ Args: { "p_in": string,"p_note": string,"p_org": string,"p_out": string,"p_outlet": string,"p_user": string }; Returns: {
              "business_date": string,
"clock_in_at": string,
"clock_out_at": string | null,
"created_at": string,
"edited_at": string | null,
"edited_by": string | null,
"id": string,
"in_photo": string | null,
"note": string | null,
"org_id": string,
"out_photo": string | null,
"outlet_id": string,
"status": Database["public"]['Enums']["time_entry_status"],
"terminal_id": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "time_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"admin_create_organization":
{ Args: { "p_name": string,"p_owner": string,"p_slug": string }; Returns: {
              "created_at": string,
"currency": string,
"id": string,
"name": string,
"slug": string
            }
                          SetofOptions: {
        from: "*"
        to: "organizations"
        isOneToOne: true
        isSetofReturn: false
      } },
"admin_end_sessions":
{ Args: { "p_user": string }; Returns: undefined
                           },
"admin_unlock_org_terminals":
{ Args: { "p_org": string }; Returns: number
                           },
"admin_unlock_owner_terminals":
{ Args: { "p_user": string }; Returns: number
                           },
"admin_user_emails":
{ Args: { "p_ids": (string)[] }; Returns: {
              "email": string,"id": string
            }[]
                           },
"admin_user_id_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"admin_user_logins":
{ Args: { "p_ids": (string)[] }; Returns: {
              "email": string,"id": string,"password_off": boolean
            }[]
                           },
"best_discount":
{ Args: { "p_day": string,"p_item": string,"p_org": string,"p_price": number,"p_qty": number }; Returns: {
              "amount": number,"id": string,"name": string
            }[]
                           },
"bill_totals":
{ Args: { "p_disc": number,"p_lines": number,"p_mode": Database["public"]['Enums']["price_mode"],"p_pb1_bps": number,"p_pb1_on_service": boolean,"p_service_bps": number }; Returns: Record<string, unknown>
                           },
"business_date":
{ Args: { "cutover_hour": number,"ts": string,"tz": string }; Returns: string
                           },
"check_clock_photo":
{ Args: { "p_org": string,"p_photo": string }; Returns: string
                           },
"clock_in":
{ Args: { "p_photo"?: string,"p_token": string }; Returns: {
              "business_date": string,
"clock_in_at": string,
"clock_out_at": string | null,
"created_at": string,
"edited_at": string | null,
"edited_by": string | null,
"id": string,
"in_photo": string | null,
"note": string | null,
"org_id": string,
"out_photo": string | null,
"outlet_id": string,
"status": Database["public"]['Enums']["time_entry_status"],
"terminal_id": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "time_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"clock_out":
{ Args: { "p_photo"?: string,"p_token": string }; Returns: {
              "business_date": string,
"clock_in_at": string,
"clock_out_at": string | null,
"created_at": string,
"edited_at": string | null,
"edited_by": string | null,
"id": string,
"in_photo": string | null,
"note": string | null,
"org_id": string,
"out_photo": string | null,
"outlet_id": string,
"status": Database["public"]['Enums']["time_entry_status"],
"terminal_id": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "time_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"clock_terminal":
{ Args: { "p_token": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"failed_pins": number,
"hard_locked_at": string | null,
"id": string,
"last_seen_at": string | null,
"name": string,
"org_id": string,
"outlet_id": string,
"reset_sent_at": string | null,
"revoked_at": string | null,
"token_hash": string,
"token_prefix": string
            }
                          SetofOptions: {
        from: "*"
        to: "terminals"
        isOneToOne: true
        isSetofReturn: false
      } },
"close_stale_shifts":
{ Args: { "p_org": string }; Returns: undefined
                           },
"create_default_roles":
{ Args: { "p_org": string }; Returns: undefined
                           },
"create_order":
{ Args: { "p_amount_tendered": number,"p_client_request_id": string,"p_items": Json,"p_org": string,"p_outlet": string,"p_priority"?: boolean }; Returns: {
              "bill_printed_at": string | null,
"business_date": string,
"client_request_id": string,
"closed_at": string | null,
"closed_by": string | null,
"cost_total": number | null,
"discount_total": number,
"grand_total": number,
"guests": number | null,
"id": string,
"kitchen_done_at": string | null,
"kitchen_done_by": string | null,
"opened_at": string,
"opened_by": string,
"order_no": number,
"org_id": string,
"outlet_id": string,
"pb1_on_service": boolean,
"price_mode": Database["public"]['Enums']["price_mode"],
"priority": boolean,
"queue_no": number | null,
"service_bps": number,
"service_total": number,
"status": Database["public"]['Enums']["order_status"],
"subtotal": number,
"table_id": string | null,
"tax_bps": number,
"tax_total": number,
"void_reason": string | null,
"voided_at": string | null,
"voided_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_print_device":
{ Args: { "p_name": string,"p_org": string,"p_outlet": string }; Returns: string
                           },
"create_terminal":
{ Args: { "p_name": string,"p_org": string,"p_outlet": string }; Returns: string
                           },
"dearmor":
{ Args: { "": string }; Returns: string
                           },
"delete_time_entry":
{ Args: { "p_entry": string,"p_note": string }; Returns: undefined
                           },
"device_claim_print_jobs":
{ Args: { "p_limit"?: number,"p_token": string }; Returns: {
              "attempts": number,"id": string,"kind": Database["public"]['Enums']["print_kind"],"order_id": string
            }[]
                           },
"device_finish_print_job":
{ Args: { "p_error"?: string,"p_job": string,"p_ok": boolean,"p_token": string }; Returns: undefined
                           },
"device_from_token":
{ Args: { "p_token": string }; Returns: {
              "created_at": string,
"id": string,
"last_seen_at": string | null,
"name": string,
"org_id": string,
"outlet_id": string,
"revoked_at": string | null,
"token_hash": string,
"token_prefix": string
            }
                          SetofOptions: {
        from: "*"
        to: "print_devices"
        isOneToOne: true
        isSetofReturn: false
      } },
"device_receipt_data":
{ Args: { "p_order": string,"p_token": string }; Returns: Json
                           },
"edit_time_entry":
{ Args: { "p_entry": string,"p_in": string,"p_note": string,"p_out": string }; Returns: {
              "business_date": string,
"clock_in_at": string,
"clock_out_at": string | null,
"created_at": string,
"edited_at": string | null,
"edited_by": string | null,
"id": string,
"in_photo": string | null,
"note": string | null,
"org_id": string,
"out_photo": string | null,
"outlet_id": string,
"status": Database["public"]['Enums']["time_entry_status"],
"terminal_id": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "time_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"gen_random_uuid":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"gen_salt":
{ Args: { "": string }; Returns: string
                           },
"has_perm":
{ Args: { "p_org": string,"p_perm": string }; Returns: boolean
                           },
"is_org_member":
{ Args: { "p_org": string }; Returns: boolean
                           },
"is_org_owner":
{ Args: { "p_org": string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_valid_timezone":
{ Args: { "tz": string }; Returns: boolean
                           },
"link_menu_recipe":
{ Args: { "p_menu_item": string,"p_recipe": string }; Returns: undefined
                           },
"move_bill":
{ Args: { "p_order": string,"p_table": string }; Returns: {
              "bill_printed_at": string | null,
"business_date": string,
"client_request_id": string,
"closed_at": string | null,
"closed_by": string | null,
"cost_total": number | null,
"discount_total": number,
"grand_total": number,
"guests": number | null,
"id": string,
"kitchen_done_at": string | null,
"kitchen_done_by": string | null,
"opened_at": string,
"opened_by": string,
"order_no": number,
"org_id": string,
"outlet_id": string,
"pb1_on_service": boolean,
"price_mode": Database["public"]['Enums']["price_mode"],
"priority": boolean,
"queue_no": number | null,
"service_bps": number,
"service_total": number,
"status": Database["public"]['Enums']["order_status"],
"subtotal": number,
"table_id": string | null,
"tax_bps": number,
"tax_total": number,
"void_reason": string | null,
"voided_at": string | null,
"voided_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"my_clock_status":
{ Args: { "p_org": string }; Returns: Json
                           },
"my_permissions":
{ Args: { "p_org": string }; Returns: (string)[]
                           },
"org_business_date":
{ Args: { "p_org": string,"ts"?: string }; Returns: string
                           },
"org_pin_holders":
{ Args: { "p_org": string }; Returns: string[]
                           },
"org_role_of":
{ Args: { "p_org": string }; Returns: Database["public"]['Enums']["org_role"]
                           },
"owner_rename_member":
{ Args: { "p_name": string,"p_org": string,"p_user": string }; Returns: undefined
                           },
"permission_keys":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"pgp_armor_headers":
{ Args: { "": string }; Returns: Record<string, unknown>[]
                           },
"pin_hash":
{ Args: { "p_org": string,"p_pin": string }; Returns: string
                           },
"print_bill":
{ Args: { "p_order": string }; Returns: undefined
                           },
"queue_reprint":
{ Args: { "p_order": string }; Returns: undefined
                           },
"recalc_bill":
{ Args: { "p_order": string }; Returns: {
              "bill_printed_at": string | null,
"business_date": string,
"client_request_id": string,
"closed_at": string | null,
"closed_by": string | null,
"cost_total": number | null,
"discount_total": number,
"grand_total": number,
"guests": number | null,
"id": string,
"kitchen_done_at": string | null,
"kitchen_done_by": string | null,
"opened_at": string,
"opened_by": string,
"order_no": number,
"org_id": string,
"outlet_id": string,
"pb1_on_service": boolean,
"price_mode": Database["public"]['Enums']["price_mode"],
"priority": boolean,
"queue_no": number | null,
"service_bps": number,
"service_total": number,
"status": Database["public"]['Enums']["order_status"],
"subtotal": number,
"table_id": string | null,
"tax_bps": number,
"tax_total": number,
"void_reason": string | null,
"voided_at": string | null,
"voided_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"refresh_time_entries":
{ Args: { "p_org": string }; Returns: undefined
                           },
"resolve_tenant_host":
{ Args: { "p_host": string }; Returns: string
                           },
"revoke_print_device":
{ Args: { "p_device": string }; Returns: undefined
                           },
"revoke_terminal":
{ Args: { "p_terminal": string }; Returns: undefined
                           },
"sales_summary":
{ Args: { "p_from": string,"p_org": string,"p_outlet"?: string,"p_to": string }; Returns: Json
                           },
"save_discount":
{ Args: { "p_active": boolean,"p_all_items": boolean,"p_ends": string,"p_id": string,"p_items": (string)[],"p_kind": Database["public"]['Enums']["discount_kind"],"p_name": string,"p_org": string,"p_starts": string,"p_value": number,"p_weekdays": (number)[] }; Returns: string
                           },
"save_floor_plan":
{ Args: { "p_area": string,"p_tables": Json }; Returns: undefined
                           },
"save_recipe":
{ Args: { "p_lines": Json,"p_name": string,"p_recipe": string,"p_yield_qty": number,"p_yield_unit": Database["public"]['Enums']["unit_code"] }; Returns: undefined
                           },
"send_round":
{ Args: { "p_client_request_id": string,"p_guests"?: number,"p_items": Json,"p_order": string,"p_org": string,"p_outlet": string,"p_table": string }; Returns: Json
                           },
"set_kitchen_done":
{ Args: { "p_done": boolean,"p_order": string }; Returns: undefined
                           },
"set_member_pin":
{ Args: { "p_org": string,"p_pin": string,"p_user": string }; Returns: undefined
                           },
"set_menu_costs":
{ Args: { "p_costs": Json,"p_org": string }; Returns: undefined
                           },
"set_round_done":
{ Args: { "p_done": boolean,"p_round": string }; Returns: undefined
                           },
"set_table_service":
{ Args: { "p_on": boolean,"p_outlet": string }; Returns: undefined
                           },
"set_terminal_options":
{ Args: { "p_idle_minutes": number,"p_lock_after_sale": boolean,"p_org": string }; Returns: undefined
                           },
"settle_bill":
{ Args: { "p_amount_tendered": number,"p_order": string }; Returns: {
              "bill_printed_at": string | null,
"business_date": string,
"client_request_id": string,
"closed_at": string | null,
"closed_by": string | null,
"cost_total": number | null,
"discount_total": number,
"grand_total": number,
"guests": number | null,
"id": string,
"kitchen_done_at": string | null,
"kitchen_done_by": string | null,
"opened_at": string,
"opened_by": string,
"order_no": number,
"org_id": string,
"outlet_id": string,
"pb1_on_service": boolean,
"price_mode": Database["public"]['Enums']["price_mode"],
"priority": boolean,
"queue_no": number | null,
"service_bps": number,
"service_total": number,
"status": Database["public"]['Enums']["order_status"],
"subtotal": number,
"table_id": string | null,
"tax_bps": number,
"tax_total": number,
"void_reason": string | null,
"voided_at": string | null,
"voided_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"shares_org_with":
{ Args: { "p_user": string }; Returns: boolean
                           },
"tenant_public_info":
{ Args: { "p_slug": string }; Returns: {
              "logo_on_dark_url": string,"logo_url": string,"name": string,"slug": string
            }[]
                           },
"terminal_from_token":
{ Args: { "p_token": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"failed_pins": number,
"hard_locked_at": string | null,
"id": string,
"last_seen_at": string | null,
"name": string,
"org_id": string,
"outlet_id": string,
"reset_sent_at": string | null,
"revoked_at": string | null,
"token_hash": string,
"token_prefix": string
            }
                          SetofOptions: {
        from: "*"
        to: "terminals"
        isOneToOne: true
        isSetofReturn: false
      } },
"terminal_info":
{ Args: { "p_token": string }; Returns: {
              "hard_locked": boolean,"idle_minutes": number,"lock_after_sale": boolean,"org_id": string,"outlet_id": string,"outlet_name": string,"slug": string,"terminal_id": string,"terminal_name": string,"token_prefix": string
            }[]
                           },
"terminal_pin_sign_in":
{ Args: { "p_pin": string,"p_token": string }; Returns: Json
                           },
"terminal_reset_targets":
{ Args: { "p_token": string }; Returns: {
              "email": string
            }[]
                           },
"void_bill_item":
{ Args: { "p_item": string,"p_reason": string }; Returns: {
              "bill_printed_at": string | null,
"business_date": string,
"client_request_id": string,
"closed_at": string | null,
"closed_by": string | null,
"cost_total": number | null,
"discount_total": number,
"grand_total": number,
"guests": number | null,
"id": string,
"kitchen_done_at": string | null,
"kitchen_done_by": string | null,
"opened_at": string,
"opened_by": string,
"order_no": number,
"org_id": string,
"outlet_id": string,
"pb1_on_service": boolean,
"price_mode": Database["public"]['Enums']["price_mode"],
"priority": boolean,
"queue_no": number | null,
"service_bps": number,
"service_total": number,
"status": Database["public"]['Enums']["order_status"],
"subtotal": number,
"table_id": string | null,
"tax_bps": number,
"tax_total": number,
"void_reason": string | null,
"voided_at": string | null,
"voided_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"void_order":
{ Args: { "p_order": string,"p_reason": string }; Returns: {
              "bill_printed_at": string | null,
"business_date": string,
"client_request_id": string,
"closed_at": string | null,
"closed_by": string | null,
"cost_total": number | null,
"discount_total": number,
"grand_total": number,
"guests": number | null,
"id": string,
"kitchen_done_at": string | null,
"kitchen_done_by": string | null,
"opened_at": string,
"opened_by": string,
"order_no": number,
"org_id": string,
"outlet_id": string,
"pb1_on_service": boolean,
"price_mode": Database["public"]['Enums']["price_mode"],
"priority": boolean,
"queue_no": number | null,
"service_bps": number,
"service_total": number,
"status": Database["public"]['Enums']["order_status"],
"subtotal": number,
"table_id": string | null,
"tax_bps": number,
"tax_total": number,
"void_reason": string | null,
"voided_at": string | null,
"voided_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "cost_period": "monthly"|"yearly","discount_kind": "percent"|"amount","fixed_cost_category": "rent"|"electricity"|"water"|"gas"|"internet"|"other","income_tax_mode": "pph_final_umkm"|"custom"|"none","order_status": "open"|"awaiting_payment"|"paid"|"voided"|"refunded","org_role": "owner"|"manager"|"cashier","payment_method": "cash"|"qris"|"va"|"card","payment_provider": "cash"|"midtrans"|"edc","payment_status": "pending"|"paid"|"expired"|"failed"|"refunded","price_mode": "exclusive"|"inclusive","print_kind": "receipt"|"reprint"|"kitchen","print_status": "queued"|"claimed"|"printed"|"failed","recipe_kind": "menu_item"|"prep","table_shape": "square"|"round"|"long","time_entry_status": "open"|"closed"|"missing_out","unit_code": "mg"|"g"|"ons"|"kg"|"ml"|"l"|"pcs"|"lusin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "cost_period": ["monthly", "yearly"],"discount_kind": ["percent", "amount"],"fixed_cost_category": ["rent", "electricity", "water", "gas", "internet", "other"],"income_tax_mode": ["pph_final_umkm", "custom", "none"],"order_status": ["open", "awaiting_payment", "paid", "voided", "refunded"],"org_role": ["owner", "manager", "cashier"],"payment_method": ["cash", "qris", "va", "card"],"payment_provider": ["cash", "midtrans", "edc"],"payment_status": ["pending", "paid", "expired", "failed", "refunded"],"price_mode": ["exclusive", "inclusive"],"print_kind": ["receipt", "reprint", "kitchen"],"print_status": ["queued", "claimed", "printed", "failed"],"recipe_kind": ["menu_item", "prep"],"table_shape": ["square", "round", "long"],"time_entry_status": ["open", "closed", "missing_out"],"unit_code": ["mg", "g", "ons", "kg", "ml", "l", "pcs", "lusin"]
          }
        }
} as const
