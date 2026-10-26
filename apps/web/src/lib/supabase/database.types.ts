
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
                    "id": string,"line_subtotal": number,"menu_item_id": string | null,"modifiers_json": NonNullable<Json>,"name_snapshot": string,"order_id": string,"org_id": string,"qty": number,"unit_cost": number | null,"unit_price": number,"void_reason": string | null,"voided": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"line_subtotal": number,"menu_item_id"?: string | null,"modifiers_json"?: NonNullable<Json>,"name_snapshot": string,"order_id": string,"org_id": string,"qty": number,"unit_cost"?: number | null,"unit_price": number,"void_reason"?: string | null,"voided"?: boolean
                  }
                  Update: {
                    "id"?: string,"line_subtotal"?: number,"menu_item_id"?: string | null,"modifiers_json"?: NonNullable<Json>,"name_snapshot"?: string,"order_id"?: string,"org_id"?: string,"qty"?: number,"unit_cost"?: number | null,"unit_price"?: number,"void_reason"?: string | null,"voided"?: boolean
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
    }
                  ]
                },"orders": {
                  Row: {
                    "business_date": string,"client_request_id": string,"closed_at": string | null,"cost_total": number | null,"discount_total": number,"grand_total": number,"id": string,"kitchen_done_at": string | null,"kitchen_done_by": string | null,"opened_at": string,"opened_by": string,"order_no": number,"org_id": string,"outlet_id": string,"pb1_on_service": boolean,"price_mode": Database["public"]['Enums']["price_mode"],"priority": boolean,"queue_no": number | null,"service_bps": number,"service_total": number,"status": Database["public"]['Enums']["order_status"],"subtotal": number,"tax_bps": number,"tax_total": number,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_date": string,"client_request_id": string,"closed_at"?: string | null,"cost_total"?: number | null,"discount_total"?: number,"grand_total"?: number,"id"?: string,"kitchen_done_at"?: string | null,"kitchen_done_by"?: string | null,"opened_at"?: string,"opened_by": string,"order_no": number,"org_id": string,"outlet_id": string,"pb1_on_service": boolean,"price_mode": Database["public"]['Enums']["price_mode"],"priority"?: boolean,"queue_no"?: number | null,"service_bps": number,"service_total"?: number,"status"?: Database["public"]['Enums']["order_status"],"subtotal"?: number,"tax_bps": number,"tax_total"?: number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "business_date"?: string,"client_request_id"?: string,"closed_at"?: string | null,"cost_total"?: number | null,"discount_total"?: number,"grand_total"?: number,"id"?: string,"kitchen_done_at"?: string | null,"kitchen_done_by"?: string | null,"opened_at"?: string,"opened_by"?: string,"order_no"?: number,"org_id"?: string,"outlet_id"?: string,"pb1_on_service"?: boolean,"price_mode"?: Database["public"]['Enums']["price_mode"],"priority"?: boolean,"queue_no"?: number | null,"service_bps"?: number,"service_total"?: number,"status"?: Database["public"]['Enums']["order_status"],"subtotal"?: number,"tax_bps"?: number,"tax_total"?: number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
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
                    "created_at": string,"id": string,"name": string,"org_id": string,"permissions": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"org_id": string,"permissions"?: (string)[]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string,"permissions"?: (string)[]
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
                    "day_cutover_hour": number,"logo_on_dark_url": string | null,"logo_url": string | null,"org_id": string,"receipt_footer": string,"receipt_header": string,"receipt_logo_url": string | null,"timezone": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "day_cutover_hour"?: number,"logo_on_dark_url"?: string | null,"logo_url"?: string | null,"org_id": string,"receipt_footer"?: string,"receipt_header"?: string,"receipt_logo_url"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "day_cutover_hour"?: number,"logo_on_dark_url"?: string | null,"logo_url"?: string | null,"org_id"?: string,"receipt_footer"?: string,"receipt_header"?: string,"receipt_logo_url"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
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
                    "active": boolean,"created_at": string,"id": string,"name": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"org_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string
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
                }
          }
          Views: {
            "current_product_prices": {
                  Row: {
                    "created_at": string | null,"effective_from": string | null,"org_id": string | null,"price": number | null,"product_id": string | null
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
"admin_user_emails":
{ Args: { "p_ids": (string)[] }; Returns: {
              "email": string,"id": string
            }[]
                           },
"admin_user_id_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"business_date":
{ Args: { "cutover_hour": number,"ts": string,"tz": string }; Returns: string
                           },
"create_default_roles":
{ Args: { "p_org": string }; Returns: undefined
                           },
"create_order":
{ Args: { "p_amount_tendered": number,"p_client_request_id": string,"p_items": Json,"p_org": string,"p_outlet": string,"p_priority"?: boolean }; Returns: {
              "business_date": string,
"client_request_id": string,
"closed_at": string | null,
"cost_total": number | null,
"discount_total": number,
"grand_total": number,
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
"my_permissions":
{ Args: { "p_org": string }; Returns: (string)[]
                           },
"org_business_date":
{ Args: { "p_org": string,"ts"?: string }; Returns: string
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
"queue_reprint":
{ Args: { "p_order": string }; Returns: undefined
                           },
"resolve_tenant_host":
{ Args: { "p_host": string }; Returns: string
                           },
"revoke_print_device":
{ Args: { "p_device": string }; Returns: undefined
                           },
"sales_summary":
{ Args: { "p_from": string,"p_org": string,"p_outlet"?: string,"p_to": string }; Returns: Json
                           },
"save_recipe":
{ Args: { "p_lines": Json,"p_name": string,"p_recipe": string,"p_yield_qty": number,"p_yield_unit": Database["public"]['Enums']["unit_code"] }; Returns: undefined
                           },
"set_kitchen_done":
{ Args: { "p_done": boolean,"p_order": string }; Returns: undefined
                           },
"set_menu_costs":
{ Args: { "p_costs": Json,"p_org": string }; Returns: undefined
                           },
"shares_org_with":
{ Args: { "p_user": string }; Returns: boolean
                           },
"tenant_public_info":
{ Args: { "p_slug": string }; Returns: {
              "logo_on_dark_url": string,"logo_url": string,"name": string,"slug": string
            }[]
                           },
"void_order":
{ Args: { "p_order": string,"p_reason": string }; Returns: {
              "business_date": string,
"client_request_id": string,
"closed_at": string | null,
"cost_total": number | null,
"discount_total": number,
"grand_total": number,
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
            "cost_period": "monthly"|"yearly","fixed_cost_category": "rent"|"electricity"|"water"|"gas"|"internet"|"other","income_tax_mode": "pph_final_umkm"|"custom"|"none","order_status": "open"|"awaiting_payment"|"paid"|"voided"|"refunded","org_role": "owner"|"manager"|"cashier","payment_method": "cash"|"qris"|"va"|"card","payment_provider": "cash"|"midtrans"|"edc","payment_status": "pending"|"paid"|"expired"|"failed"|"refunded","price_mode": "exclusive"|"inclusive","print_kind": "receipt"|"reprint"|"kitchen","print_status": "queued"|"claimed"|"printed"|"failed","recipe_kind": "menu_item"|"prep","unit_code": "mg"|"g"|"ons"|"kg"|"ml"|"l"|"pcs"|"lusin"
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
            "cost_period": ["monthly", "yearly"],"fixed_cost_category": ["rent", "electricity", "water", "gas", "internet", "other"],"income_tax_mode": ["pph_final_umkm", "custom", "none"],"order_status": ["open", "awaiting_payment", "paid", "voided", "refunded"],"org_role": ["owner", "manager", "cashier"],"payment_method": ["cash", "qris", "va", "card"],"payment_provider": ["cash", "midtrans", "edc"],"payment_status": ["pending", "paid", "expired", "failed", "refunded"],"price_mode": ["exclusive", "inclusive"],"print_kind": ["receipt", "reprint", "kitchen"],"print_status": ["queued", "claimed", "printed", "failed"],"recipe_kind": ["menu_item", "prep"],"unit_code": ["mg", "g", "ons", "kg", "ml", "l", "pcs", "lusin"]
          }
        }
} as const
