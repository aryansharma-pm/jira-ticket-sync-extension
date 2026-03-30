/**
 * knowledge.js
 * JMD Platform knowledge base — DRI contacts, version features, Jira patterns, FAQ.
 */

export const JMD_KNOWLEDGE = {
  currentVersion: "1.9.5",
  versions: {
    "1.9.5": {
      label: "v1.9.5", released: "October 15, 2024", status: "current",
      highlights: ["Logistics Dashboard 20+ metrics", "Multi-Qty Return Shipments", "Merged Invoice+Label", "Audit Trail Revamp", "Maker-Checker Coupons", "New Webhook Broadcasters"],
      features: {
        platform: ["Scheduler for page publishing via navigation menu", "Freshchat integration for Fynd Commerce UI and Mobile App", "Fix: Categories page shows all departments by default"],
        product: ["Inventory page: Renamed Sold Quantity to Order Committed", "SAC Code taxation for service products (COD HSN: 996819)", "Default COD config for new development companies", "Fix: Discounts retained on recreated products"],
        audit_trail: ["Full revamp: Merged Audit Trail and Webhook services", "Redesigned UI with advanced filters and payload comparison", "Automated email alerts for critical events"],
        profile: ["Pre-fill dev companies with sample data", "Free extensions from any partner org installable in dev companies", "Editable sample payload in admin panel", "Dev companies visible in Platform Panel company listing"],
        theme_editor: ["Single user edit limitation — Theme Collaborator vs Approver roles", "Block-level extension support for React and Vue themes", "Header and footer section customization", "Zone and Scheduler status indicators in theme editor"],
        analytics: ["Logistics Dashboard with 20+ metrics, Geo Maps, Pie Charts", "Downloadable reports via shortlinks for large datasets"],
        webhook: ["New broadcaster types: GCP PubSub, Amazon SQS, Amazon EventBridge, Temporal"],
        promotions: ["Maker-Checker process for coupon and promotion fraud prevention", "Discount on pre-paid orders via standard checkout", "Fix: Free Gift multi-size support (OS gifts, size matching)"],
        oms: ["Merged Invoice + Label printing in one PDF", "MTO (Made To Order) tag in OMS", "Upcoming Orders tab with Scheduled tag", "B2B2C order management support", "Cross-border checkout and merchant currency display", "Removed default lock on MTO orders"],
        logistics: ["Return shipment config based on DP QC limits (multi-quantity)", "New Carrier Name field for accurate courier tracking", "Editable City field for India (PINCODE > CITY > STATE)", "Define TAT by destination country via API"],
        communication: ["Payment mode-specific templates (COD vs Prepaid)", "Standardized communication templates across verticals"],
        payments: ["Payment Link management for POS and Store OS", "Alignment of refund and collection processes", "Updated payment failure message for Payment Link MOP"],
        cart: ["Improved address dropdown UX in cart", "Coupon end date is now mandatory"],
        developer_tools: ["Custom Field Management for Bag and Product Size objects", "HTML type support in Custom Fields"],
        content: ["Blog editor: tag list input, query params, preview link, pre-filled scheduling"]
      }
    },
    "2.0.0": {
      label: "v2.0.0", released: "November 25, 2024", status: "stable",
      highlights: ["Manual Order Creation in OMS", "Custom OMS Lane Views", "StoreOS Extensions", "Reverse Pickup Serviceability", "Partner Audit Trail", "Fynd Utilities no-code apps"],
      features: {
        oms: ["Manual order creation for telephonic sales and offline campaigns", "Custom super lane and sub lane views in OMS", "Shipment price breakdown with full cost transparency"],
        store_os: ["Extensions support in StoreOS — full pages, popups, links", "Partners can build and integrate custom StoreOS extensions"],
        logistics: ["Reverse Pickup option — return serviceability independent from forward journey", "Courier partners can set return serviceability rules separately"],
        partner: ["Partner Panel Audit Trail — track accounts, extensions, themes, team, access tokens"],
        utilities: ["Fynd Utilities: no-code apps via Appsmith integrated into platform", "Early access to features before full release"]
      }
    },
    "2.1.0": {
      label: "v2.1.0", released: "December 23, 2024", status: "stable",
      highlights: ["Price Breakdown in OMS", "Bulk MTO Update", "Coupon in Buy Now", "Shipment Priority Tags", "3-Month OMS Download"],
      features: {
        product: ["Bulk management of multi-valued attributes, tags, highlights via import", "Bulk upload to update MTO to non-MTO products and vice versa"],
        oms: ["Detailed price breakdown per shipment — charges, discounts, promotions, coupons", "Extended data download: up to 3 months in OMS", "Shipment tags: SAME DAY DELIVERY, NEXT DAY DELIVERY, HYPERLOCAL (auto-applied)"],
        cart: ["Coupon support in Buy Now checkout flow"],
        payments: ["Dynamic E-mandate amount via API for Add Card feature", "Unique slug validation for payment extension creation"]
      }
    }
  },
  dri: [
    { service: "Catalog", codenames: ["Frenzy","Wildrider","Martell","Slingshot","Silverbolt"], primary: "Vidit", backup: "Chirag Solanki", keywords: ["catalog","product","listing","sku","category","department","brand","attribute","template","hsn","sac","frenzy","wildrider","martell","slingshot","silverbolt","bundle","collection","size guide"] },
    { service: "Inventory", codenames: ["Frenzy","Wildrider","Martell","Slingshot","Silverbolt"], primary: "Vidit", backup: "Chirag Solanki", keywords: ["inventory","stock","quantity","available","sellable","damaged","order committed","location inventory","buffer"] },
    { service: "Search", codenames: ["Frenzy","Wildrider","Martell","Slingshot","Silverbolt"], primary: "Vidit", backup: "Chirag Solanki", keywords: ["search","merchandising","ranking","reranking","filter","sort","keyword","product discovery","search result","autocomplete"] },
    { service: "Pricing & Discounts", codenames: ["Frenzy","Wildrider","Martell","Slingshot","Silverbolt"], primary: "Vidit", backup: "Chirag Solanki", keywords: ["pricing","discount","price","selling price","mrp","esp","bulk price","threshold","price factory","price breakdown"] },
    { service: "Theme & CMS", codenames: ["Convex","HighBrow","Blitzkrig","Jetfire","Skyfire"], primary: "Mahima Ramprasad", backup: "Arunoday Ray", keywords: ["theme","cms","content","page","blog","navigation","menu","faq","landing page","legal","html tag","seo markup","template","convex","highbrow","blitzkrig","jetfire","skyfire","vue","react theme","storefront content","custom page","redirect"] },
    { service: "Marketing & Communications", codenames: ["Pointblank","Sentinel"], primary: "Mahima Ramprasad", backup: "Apoorva", keywords: ["communication","email","sms","notification","template","event","marketing","campaign","pointblank","sentinel","push notification","whatsapp"] },
    { service: "Platform UI (Frontend)", codenames: ["Mirage","Blaster","Galvatron","Scattershot","TriggerHappy"], primary: "Mahima Ramprasad", backup: "Arunoday Ray", keywords: ["ui","frontend","platform ui","panel","dashboard","interface","mirage","blaster","galvatron","scattershot","triggerhappy","console","admin panel"] },
    { service: "Webhooks & Analytics", codenames: [], primary: "Chirag Solanki", backup: "Arunoday Ray", keywords: ["webhook","analytics","event","subscriber","broadcaster","kafka","pubsub","sqs","eventbridge","temporal","audit trail","report","metrics","logistics analytics"] },
    { service: "User & Authorisation", codenames: ["Deadlock","Sureshot"], primary: "Arunoday Ray", backup: "Arunoday Ray", keywords: ["user","auth","login","token","oauth","session","customer","authentication","authorization","deadlock","sureshot","access","permission","user group","customer attribute"] },
    { service: "Cart (Checkout, Promotions & Coupons)", codenames: ["Megatron"], primary: "Apoorva", backup: "Arunoday Ray", keywords: ["cart","checkout","coupon","promotion","megatron","offer","discount code","promo","free gift","bank offer","price adjustment","reward point","loyalty","prepaid","cod","cart address","abandoned cart","maker checker","buy now"] },
    { service: "Payments", codenames: ["Gringotts"], primary: "Shivam Arora", backup: "Arunoday Ray", keywords: ["payment","refund","gringotts","payment link","payment gateway","pg","netbanking","upi","wallet","emi","cod payment","payment failure","pos payment","aggregator","beneficiary","payout","payment session","mandate","e-mandate"] },
    { service: "OMS (Order Management)", codenames: ["Avis","Computron"], primary: "Shivam Arora", backup: "Arunoday Ray", keywords: ["oms","order","shipment","avis","computron","invoice","label","manifest","return","rto","mto","b2b2c","order status","bag","fulfillment","dispatch","packed","placed","delivered","cancelled","lock","upcoming orders","same day","next day","hyperlocal","shipment tag","lane view","manual order"] },
    { service: "Platform Config", codenames: [], primary: "Apoorva", backup: "Arunoday Ray", keywords: ["platform config","configuration","sales channel config","app config","channel config","esm","state manager","ordering source"] },
    { service: "FDK (Developer Kit)", codenames: ["Bombshell","Mixmaster","Brainstorm"], primary: "Chirag Solanki", backup: "Arunoday Ray", keywords: ["fdk","sdk","extension","developer kit","bombshell","mixmaster","brainstorm","cli","api","client library","javascript sdk","platform api","application api","storefront api","graphql","partner api"] },
    { service: "Common Extensions", codenames: [], primary: "Chirag Solanki", backup: "Apoorva", keywords: ["extension","common extension","marketplace extension","free extension","development account","extension install","partner extension","block level extension","store os extension"] },
    { service: "SEO", codenames: [], primary: "Apoorva", backup: "Arunoday Ray", keywords: ["seo","meta","sitemap","canonical","breadcrumb","schema","markup","search engine","seo title","seo description","robots"] },
    { service: "Serviceability", codenames: ["Stormbreaker"], primary: "Apoorva", backup: "Arunoday Ray", keywords: ["serviceability","stormbreaker","pincode","zone","geoarea","courier","delivery partner","dp","tat","turnaround","packaging","self ship","fulfillment option","store rule","routing rule","cod pincode","reverse pickup","return serviceability"] }
  ],
  jiraPatterns: {
    payment:  { service: "Payments (Gringotts)", dri: "Shivam Arora", keywords: ["payment","refund","gateway","pg","upi","netbanking","wallet","cod","link","mandate","aggregator"] },
    cart:     { service: "Cart/Promotions/Coupons (Megatron)", dri: "Apoorva", keywords: ["cart","coupon","promotion","discount","offer","checkout","buy now","promo code","free gift"] },
    oms:      { service: "OMS (Avis/Computron)", dri: "Shivam Arora", keywords: ["order","shipment","invoice","label","manifest","return","rto","bag","fulfillment","dispatch","cancellation","delivery","lane"] },
    catalog:  { service: "Catalog/Inventory (Frenzy et al.)", dri: "Vidit", keywords: ["product","catalog","inventory","sku","category","brand","attribute","size","stock","listing"] },
    search:   { service: "Search (Frenzy et al.)", dri: "Vidit", keywords: ["search","filter","sort","rank","keyword","discovery","autocomplete","result"] },
    logistics:{ service: "Serviceability (Stormbreaker)", dri: "Apoorva", keywords: ["courier","delivery","zone","pincode","serviceability","tat","pickup","packaging","routing"] },
    theme:    { service: "Theme & CMS (Jetfire/Skyfire)", dri: "Mahima Ramprasad", keywords: ["theme","page","cms","blog","navigation","template","storefront","content"] },
    webhook:  { service: "Webhooks & Analytics", dri: "Chirag Solanki", keywords: ["webhook","event","analytics","report","audit","broadcaster","subscriber","kafka"] },
    auth:     { service: "User & Auth (Deadlock/Sureshot)", dri: "Arunoday Ray", keywords: ["login","auth","token","user","session","oauth","permission","access"] },
    fdk:      { service: "FDK (Bombshell/Mixmaster/Brainstorm)", dri: "Chirag Solanki", keywords: ["sdk","api","extension","fdk","developer","client library","endpoint"] }
  },
  megatron: {
    overview: "Megatron is the Universal Cart service — manages cart operations, promotions, coupons, pricing, inventory reservations, and checkout for the JMD platform. Built in Python with MongoDB (umongo ODM) and Redis caching.",
    stack: "Python, MongoDB (umongo), Redis, Kafka (Avis consumer)",
    codename: "Megatron",
    dri: "Apoorva (Primary), Arunoday Ray (Backup)",

    models: {
      CartBaseClass: {
        description: "Foundational cart model. All cart types (Cart, AnonymousCart) inherit from this.",
        keyFields: {
          uid: "Auto-incrementing unique ID per cart (SequenceField)",
          user_id: "Owner of the cart (required)",
          articles: "Array of CartObject — the line items",
          cart_value: "Total cart value in seller currency",
          is_default: "Whether this is the user's default cart",
          buy_now: "BooleanField — true for Buy Now (non-cart) flow, bypasses cart",
          is_archive: "BooleanField — archived cart, not active",
          is_active: "BooleanField — active/inactive status",
          merge_qty: "BooleanField — merge same articles instead of creating separate lines",
          checkout_mode: "String, default='self' — controls checkout flow type",
          gstin: "GST Identification Number",
          bulk_coupon_discount: "Total bulk coupon discount amount",
          expire_at: "Cart expiry — 360 days for logged-in carts, 90 days for anonymous",
          staff_user_id: "Staff member managing the cart (for admin-created orders)",
          coupon: "CartCouponObject — applied coupon at cart level",
          promotion: "CartPromoObject — applied promotion at cart level",
          fynd_credits: "FyndCreditsObject — loyalty currency (FC) amount",
          charges: "ListField of ChargesObject — miscellaneous charges"
        },
        expiry: "pre_update sets expire_at = now + 360 days. Anonymous carts = 90 days."
      },

      CartObject: {
        description: "Embedded document — a single line item in the cart.",
        keyFields: {
          item_id: "Product item identifier (required, IntegerField)",
          item_size: "Size variant (required, StringField)",
          article_id: "Unique article SKU identifier",
          quantity: "Line item quantity (default=1, min=1)",
          price_marked: "MRP — Maximum Retail Price",
          price_effective: "Selling price after brand discount",
          store_id: "Fulfillment store",
          company_id: "Brand/company ID",
          parent_item_identifiers: "DictField — for grouped/bundled items references the parent",
          article_assignment: "Level and strategy for fulfillment (level: 'multi-companies', strategy: 'optimal')",
          coupon: "CouponCartObject — coupon discount on this specific article",
          promotion: "ListField of DictField — applied promotions for this article",
          bulk_coupon: "DictField — bulk purchase coupon with margin/discount/code",
          charges: "ListField of ChargesArticleObject — article-level charges",
          service_item_meta: "DictField — service-specific metadata",
          gift_card: "DictField — gift card info if applicable"
        }
      },

      CartArticleWrapper: {
        description: "Runtime wrapper for a single line item — handles all pricing calculations, discount application, and validation at runtime (not persisted to DB).",
        keyFlags: {
          verify_article: "BooleanField (from config VERIFY_ARTICLE) — when True, article is verified against live inventory before checkout. Controls whether stock check is enforced per article. Set per environment in DockerConfig.",
          valid_inventory: "BooleanField — whether stock is available for this article",
          is_valid: "BooleanField — overall validation status of the article",
          include: "BooleanField — whether to include this article in cart calculation",
          bulk_coupon_applied: "BooleanField — bulk coupon has been applied to this article",
          coupon_plt_applied: "BooleanField — product-level threshold coupon applied",
          to_be_splitted: "BooleanField — article needs to split for MRP vs non-MRP promotion calculation",
          mrp_promo_applied: "BooleanField (via PromotionCartObjWrapper) — MRP-based promotion is active",
          external_promo_added: "BooleanField — external promotion applied",
          external_mop_added: "BooleanField — external method-of-payment discount applied"
        },
        pricingFields: {
          unit_price: "Per-unit price",
          net_price: "Amount object — net price after all discounts",
          amount_paid: "Final rounded amount user pays",
          float_amount_paid: "Float (unrounded) amount paid",
          gst_amount: "GST tax per unit",
          total_gst_amount: "Total GST for quantity",
          value_of_good: "Taxable value (net of GST)",
          price_adjustment_values: "Injected external price adjustments"
        },
        inventoryFields: {
          avl_qty: "Available quantity from inventory service",
          size_level_total_qty: "Total quantity at size level",
          quantity_assign_status: "Fulfillment assignment status",
          article_assign_status: "Article assignment validation status"
        }
      },

      Couponv3: {
        description: "Version 3 coupon model with flexible rule definitions.",
        keyFields: {
          code: "Coupon code user enters",
          type_slug: "Coupon type identifier",
          is_archived: "BooleanField (default=False) — archived flag",
          identifiers: "Target audience — brand_id, company_id, collection_id, store_id, item_id, article_id, category_id, user_id, email_domain, exclude_brand_id",
          rule: "Array of rules with {key, value, min, max, discount_qty} — defines thresholds and discount amounts",
          rule_definition: "Rule template: is_exact (strict match), applicable_on ('amount'/'quantity'/'order_count'/'payment_mode')",
          restrictions: "Usage restrictions: uses (per user + total), post_order (return/cancel), platforms, user_id, payments, user_registered, ordering_stores",
          validity: "Date/time window",
          action: "Action on apply — txn_mode: 'fynd_cash' for cashback coupons",
          _schedule: "next_schedule array with {start, end} objects for active periods",
          ownership: "Who pays the discount (seller, fynd, etc.)"
        },
        couponTypes: {
          cashback: "action.txn_mode = 'fynd_cash' — gives Fynd cash instead of direct discount",
          bank_offer: "Multiple payment modes OR non-COD payment required",
          bulk: "Rule with discount_qty — applies only to capped quantity",
          strict: "rule_definition.is_exact = true — discount capped to exact match quantity only"
        },
        applicationLogic: [
          "Filter applicable articles by lowest net_price first",
          "strict_rule_match (is_exact=True) caps discount to specific quantity only",
          "Discount cannot exceed total price of applicable articles",
          "Rules ordered by applicability; multiple matches = last one wins",
          "Bank offers require non-COD payment mode"
        ]
      },

      Promotions: {
        description: "Promotion model for seller/store-level offers with complex targeting.",
        keyFields: {
          buy_rules: "DictField (required) — conditions for promotion applicability",
          discount_rules: "Array of DiscountRule — what discount to apply and on which items",
          stackable: "BooleanField — can this promotion stack with others",
          apply_exclusive: "StringField — exclusive promotion, prevents others from applying",
          apply_priority: "IntegerField — higher value applied first",
          promo_group: "StringField — LADDER_PRICE, CONTRACT (special handling, excluded from normal queries)",
          promotion_type: "Type: ladder_price, free_gift, external_price_adjustment_discount, etc.",
          apply_all_discount: "BooleanField — apply discount to ALL eligible items",
          restrictions: "Usage restrictions (same structure as coupon)",
          visiblility: "coupon_list (bool), pdp (bool) — where to display",
          indexed_criteria: "Indexed for fast lookup queries",
          calculate_on: "What to calculate discount on"
        },
        promotionTypes: {
          free_gift_items: "Free gift for qualifying purchase",
          ladder_price: "Tiered/volume pricing — buy more pay less",
          external_price_adjustment_discount: "External discount injected into cart"
        },
        applicationLogic: [
          "Sorted by date_meta.created_on (oldest first) then apply_priority (descending)",
          "LADDER_PRICE and CONTRACT promos excluded from standard queries — special handling",
          "Exclusive promotions prevent all other promotions",
          "MRP promotions tracked separately via mrp_promo_applied flag",
          "Caching by app_id via get_promo_app_cache() and set_promo_app_cache()"
        ]
      }
    },

    configFlags: {
      VERIFY_ARTICLE: "Boolean (per env) — whether to verify articles against live inventory before checkout. When True, stock check is enforced per CartArticleWrapper.verify_article.",
      DISABLE_MULTI_FREE_GIFT_PROMO: "True for 'jmp', 'jmpz0', 'jmpz5' — disables multiple free gift promotions in those clusters",
      PRICE_ROUND_OFF_ENABLED: "True for 'jioretailer', 'jiox1', 'jiox5', 'jmdz0', 'jmdz5' — enables price rounding",
      PRICE_ROUND_CLIP_ENABLED: "True for 'jmp', 'jmpz0', 'jmpz5' — enables price clipping",
      DISABLE_BIN_LOCKING_COUPON: "False for 'tira', 'tiraz0', 'tiraz5' — enables bin locking coupons for Tira",
      DISABLE_GENERATE_FALLBACK_SHIPMENT: "True for 'swadeshz0', 'swadeshz5', 'swadesh' — disables fallback shipment generation",
      BUY_RULES_PAYLOAD_REMOVE: "True for fyndz0, fyndz5 etc — removes buy_rules from API response",
      RESERVE_INVENTORY_ENABLED: "Boolean — enable 20-minute inventory reservation for cart items",
      ANONYMOUS_TTL: "90 days (7776000 seconds) — anonymous cart lifetime"
    },

    clusters: {
      jmd: "JMD cluster — jmdz0 (staging), jmdz5 (pre-prod). PRICE_ROUND_OFF_ENABLED=True",
      jmp: "JMP cluster — jmp, jmpz0, jmpz5. DISABLE_MULTI_FREE_GIFT_PROMO=True, PRICE_ROUND_CLIP_ENABLED=True",
      jioretailer: "JioRetailer — PRICE_ROUND_OFF_ENABLED=True",
      jiox: "JioX cluster — jiox1, jiox5. PRICE_ROUND_OFF_ENABLED=True",
      tira: "Tira cluster — tira, tiraz0, tiraz5. DISABLE_BIN_LOCKING_COUPON=False (bin locking enabled)",
      swadesh: "Swadesh cluster — DISABLE_GENERATE_FALLBACK_SHIPMENT=True",
      fynd: "Fynd cluster — fyndz0, fyndz5. BUY_RULES_PAYLOAD_REMOVE=True"
    },

    businessRules: {
      cartLifecycle: [
        "Anonymous cart created with is_default=True, expires in 90 days",
        "On user login, AnonymousCart.set_cart_user_id() links anonymous cart to user",
        "Cart validity extends to 360 days after each modification (pre_update)",
        "Empty anonymous carts (no articles) are NOT saved to DB",
        "buy_now=True carts bypass standard cart flow — single-item express checkout"
      ],
      inventoryReservation: [
        "ReserveInventory TTL = 20 minutes (auto-released)",
        "Per user + cart + article",
        "Enabled via RESERVE_INVENTORY_ENABLED config flag"
      ],
      articleSplitting: [
        "Articles may split into MRP and non-MRP segments for promotion calculation",
        "to_be_splitted flag on CartArticleWrapper controls this",
        "split_article_id created as unique identifier post-split",
        "split promotions marked with splitted_promo=True"
      ],
      postOrderRules: [
        "Each coupon/promotion has return_allowed and cancellation_allowed flags",
        "Aggregated with AND logic — ALL applied promos must allow for order to be returnable",
        "Defaults to True if not specified in restrictions"
      ],
      currencyHandling: [
        "All amounts wrapped in Amount object with source and destination currencies",
        "Amount.value = display currency value",
        "Amount.source_value = seller currency value",
        "Amount.floor_value = rounded display value",
        "Conversion via _cur_convertor utility"
      ]
    },

    services: {
      gringotts: "Payment service API endpoint (GRINGOTTS_API_POINT)",
      lightspeed: "Rewards/loyalty service (LIGHTSPEED_MAIN_URL)",
      deadlock: "Auth service internal URL (DEADLOCK_INTERNL_URL)",
      avis: "OMS consumer — Megatron consumes Avis events (CONSUMER_TYPE=avis)",
      stormbreaker: "Serviceability — Redis cache (stormbreaker cache backend)",
      slingshot: "Catalog/inventory — Redis cache (slingshot cache backend)"
    },

    caching: {
      promotions: "get_promo_app_cache() / set_promo_app_cache() keyed by app_id",
      promotionUsage: "get_cached_promo_meta() / cache_promo_meta() keyed by user+promotion",
      backends: "Redis: default, orbis, slingshot, stormbreaker cache layers"
    }
  },

  avis: {
    overview: "Avis is the OMS (Order Management System) — manages business logic, models, REST APIs, state machine, bag/shipment/order lifecycle, delivery partner assignment, refunds, returns, and store dashboard for the JMD platform. Built in Python with MySQL (SQLAlchemy), MongoDB, Redis, and Kafka.",
    stack: "Python, MySQL (SQLAlchemy), MongoDB (orbis/computron/stormbreaker), Redis (multiple instances), Kafka (event bridge)",
    codenames: ["Avis", "Computron"],
    dri: "Shivam Arora (Primary), Arunoday Ray (Backup)",

    models: {
      Order: {
        description: "Core order record in MySQL.",
        keyFields: {
          fynd_order_id: "Unique order identifier (String 20)",
          user_id: "Customer reference",
          payment_mode_id: "FK to PaymentMode",
          ordering_channel: "Channel type (String 25)",
          mode_of_payment: "MOP (String 25)",
          is_cancelled: "Boolean — cancellation status",
          prices: "JSON — order_value, delivery_charges, discount, coupon_value, convenience_fee, fynd_credits, cod_charges, cashback, total_order_value, promotion_effective_discount",
          source: "Order source: iOS/Android/Web"
        }
      },
      Bag: {
        description: "Line item within an order — tracks state, GST, invoice, delivery, flags.",
        keyFields: {
          current_status: "FK to BagStatus — current state",
          current_operational_status: "FK to BagStatus — operational view",
          order_type: "buy (forward) or return",
          bag_type: "forward_standard (default), exchange_order, fynd_a_fit",
          journey_type: "Journey classification",
          parent_id: "Parent bag reference (for bundles/promo bags)",
          parent_promo_bags: "JSON — promo parent bags",
          applied_promos: "JSON — applied promotions",
          meta: "JSON — arbitrary metadata",
          is_returnable: "Boolean (default False)",
          can_be_cancelled: "Boolean (default True)",
          can_be_exchanged: "Boolean (default True)",
          is_customer_return_allowed: "Boolean (default False)",
          added_to_fynd_cash: "Boolean — cashback converted to Fynd Cash",
          is_default_hsn_code: "Boolean (default True)",
          hsn_code: "GST HSN code (String 12)",
          gst_tax_percentage: "GST rate (Float, default 0.0)",
          delivery_awb_number: "Courier AWB tracking number",
          eway_bill_id: "E-way bill ID for GST",
          store_invoice_id: "Invoice number from store",
          line_number: "Line number in shipment"
        }
      },
      Shipment: {
        description: "Groups bags for delivery. Has its own status and tracking.",
        keyFields: {
          id: "Shipment ID (String 200) — primary key",
          type: "shipment (default), set, container, box",
          tags: "ScalarListType — SAME_DAY_DELIVERY, NEXT_DAY_DELIVERY, HYPERLOCAL (auto-applied)",
          fulfilment_priority: "Integer (default 10) — routing priority",
          lock_status: "Shipment lock state",
          is_active: "Boolean (default True)",
          delivery_awb_number: "AWB tracking number",
          parent_id: "Parent shipment reference",
          affiliate_id: "Affiliate/marketplace reference",
          pdf_links: "JSON — invoice, label PDF URLs",
          billing_address_json: "JSON — billing address snapshot",
          delivery_address_json: "JSON — delivery address snapshot",
          manifest_details: "JSON — manifest data",
          meta: "JSON — arbitrary metadata",
          credit_note_id: "Credit note reference"
        }
      },
      BagStateMapper: {
        description: "Defines valid states. Referenced by BagStatus.",
        keyFields: {
          name: "Unique state name (String 150)",
          display_name: "Customer-facing display name",
          app_display_name: "App-specific display name",
          app_facing: "Boolean — whether shown in app",
          notify_customer: "Boolean — whether to trigger customer notification",
          state_type: "operational (default) or other",
          journey_type: "forward or return"
        }
      },
      StateTransition: {
        description: "Allowed transitions between states. identifier = fynd or affiliate.",
        keyFields: {
          source_state_id: "From state",
          destination_state_id: "To state",
          identifier: "fynd (direct orders) or affiliate (marketplace orders)",
          is_active: "Boolean — transition enabled"
        }
      }
    },

    bagStates: {
      forward: {
        placed: 1, bag_confirmed: 45, bag_packed: 46, dp_assigned: 26, dp_not_assigned: 44,
        in_transit: 35, out_for_delivery: 6, delivery_done: 7, handed_over_to_customer: 95,
        bag_invoiced: 91, ready_for_dp_assignment: 116, delivery_attempt_failed: 97,
        delivery_sla_breached: 143
      },
      cancellation: {
        cancelled_customer: 8, cancelled_fynd: 16, cancelled_at_dp: 47,
        cancelled_failed_at_dp: 48, cancelled_seller: 135, cancelled_operations: 142,
        cancellation_requested: 113, cancellation_rejected: 114
      },
      returnFlow: {
        return_initiated: 9, return_dp_assigned: 38, return_dp_out_for_pickup: 100,
        return_bag_picked: 73, return_bag_in_transit: 72, return_bag_out_for_delivery: 52,
        return_accepted: 10, return_rejected_by_store: 22, return_not_accepted: 74,
        return_completed: 61, return_cancelled_at_dp: 99, return_pre_qc: 118,
        qc_pass: 120, qc_fail: 121, return_request_cancelled: 75
      },
      rto: {
        rto_initiated: 102, rto_in_transit: 77, rto_bag_out_for_delivery: 103,
        rto_bag_delivered: 76, rto_bag_accepted: 78
      },
      refund: {
        refund_requested: 127, refund_initiated: 62, refund_completed: 63,
        refund_failed: 64, refund_retry: 109, refund_approved: 66,
        refund_pending_for_approval: 107, refund_on_hold: 108, manual_refund: 138,
        credit_note_generated: 117, refund_without_return: 141
      },
      qcAndVerification: {
        bag_verified: 79, bag_not_verified: 80, qc_pass: 120, qc_fail: 121
      },
      payment: {
        pending: 89, awaiting_payment: 112, awaiting_payment_confirmation: 115, payment_failed: 87
      }
    },

    customerFacingStatus: {
      placed: "PROCESSING", bag_confirmed: "PROCESSING", bag_packed: "PROCESSING",
      dp_assigned: "PROCESSING", in_transit: "IN TRANSIT",
      out_for_delivery: "OUT FOR DELIVERY", delivery_done: "DELIVERED",
      cancelled_customer: "CANCELLED", cancelled_fynd: "OUT OF STOCK IN STORE",
      return_initiated: "RETURN PROCESSING", return_completed: "RETURNED",
      return_accepted: "RETURN ACCEPTED", return_rejected_by_store: "RETURN REJECTED by Store",
      exchange_initiated: "EXCHANGE PROCESSING", exchange_completed: "EXCHANGED",
      refund_initiated: "Refund Initiated", refund_done: "Refund Done",
      delivery_attempt_failed: "Delivery Attempt Failed"
    },

    cancellableStates: {
      customer_and_fynd: ["placed", "bag_not_handed_over_to_dg", "bag_rescheduled", "dp_assigned", "store_reassigned", "product_not_available"],
      fynd_only: ["in_transit", "handed_over_to_dg", "out_for_delivery"]
    },

    businessRules: {
      autoInvoiceStates: ["bag_confirmed", "bag_packed", "rto_bag_accepted", "return_accepted"],
      smsNotificationStates: ["placed", "out_for_delivery", "delivery_done", "cancelled_customer", "cancelled_fynd", "return_initiated", "return_accepted", "bag_confirmed", "bag_packed", "refund_initiated", "refund_completed", "bag_lost", "rto_initiated", "return_bag_picked", "delivery_attempt_failed"],
      returnAllowedStates: ["delivery_done", "return_request_cancelled"],
      postPayModes: ["COD", "CDOD", "FC"],
      codLimit: "CART_COD_LIMIT = 5000, STORE_USER_CART_COD_LIMIT = 55000",
      returnStoreTypes: ["warehouse", "mall", "high_street"],
      shipmentTags: "SAME_DAY_DELIVERY (promise=order date), NEXT_DAY_DELIVERY (promise=order+1), HYPERLOCAL (same day + within 5 hours) — auto-applied since v2.1.0",
      refundIdempotencyTTL: "REFUND_IDEMPOTENCY_TTL = 259200 (3 days) — prevents duplicate refunds",
      stateTransitionIdentifiers: "fynd (direct Fynd orders) vs affiliate (AJIO, Myntra, Flipkart, etc.) — different allowed transitions",
      inventoryReservationTTL: "RESERVE_INVENTORY_ENABLED — 20 min hold via Megatron"
    },

    deliveryConfig: {
      defaultDP: "DelhiveryAPI (ID=7)",
      manualDP: "fyndr (ID=22)",
      hyperlocalThreshold: "8 km",
      maxDeliveryDistance: "50000 meters",
      additionalDays: "SDD=0, NDD=1",
      deliveryPartners: "Parcelled=1, RoadRunnr=2, Yourguy=3, Ecom=4, Delhivery=7, BlueDart=12, XpressBees=25, Ekart=28, Lalamove=31, DelhiveryB2B=32, BlueDartExpress=33"
    },

    services: {
      computron: "Computron MongoDB — OMS operational data (read + write)",
      orbis: "Orbis MongoDB — read-only reference data",
      slingshot: "Slingshot MongoDB and Redis — catalog/inventory",
      stormbreaker: "Stormbreaker MongoDB — serviceability data (read-only)",
      skywarp: "Skywarp service (internal)",
      sentinel: "Sentinel service (communication/notifications)",
      grindor: "File upload service (invoices, labels, manifests)",
      silverbolt: "Encryption + store reassignment API",
      megatron: "Cart service — Avis consumes Megatron events via Kafka (CONSUMER_TYPE=avis)",
      gringotts: "Payment service — refund initiations go through Gringotts"
    },

    redisKeys: {
      bagState: "bag_state_{bag_id}",
      destinationBagState: "bag:destination:state:{bag_id}",
      roleWiseNextStates: "role_wise_next_possible_states|role:{}|identifier:{}|state:{}",
      refundIdempotency: "refund:idempotency:bag:{bag_id}",
      pincodeCodAvailable: "pincodes:cod:available",
      deliveryRule: "delivery:rule:{rule_id}",
      paymentModeCached: "payment_mode",
      hyperlocalDpIds: "hyperlocal_dp_ids"
    },

    orderTypes: {
      FORWARD_ORDER_TYPE: "buy — regular purchase",
      RETURN_ORDER_TYPE: "return — return order",
      ORDER_TYPE_HYPERLOCAL: "hyper_local — same-city fast delivery",
      ORDER_TYPE_INTRACITY: "intra_city — within-city delivery",
      ORDER_TYPE_EXCHANGE: "exchange — exchange order"
    },

    bagTypes: {
      forward_standard: "Standard forward order (default)",
      exchange_order: "Exchange order",
      fynd_a_fit: "Try-at-home (Fynd A Fit)"
    },

    affiliates: {
      description: "Marketplace/affiliate orders use identifier='affiliate' for state transitions. Major affiliates: AJIO, Vision Express, Myntra, Flipkart Assured, Mothercare, Superdry, Brooks Brothers, Satya Paul, Octave (20+ total).",
      keyDifference: "Affiliate orders use different allowed state transitions from Fynd direct orders (StateTransition.identifier = 'fynd' vs 'affiliate')"
    }
  },

  platformApi: {
    description: "Platform REST API — manage a Fynd Platform company programmatically. Same data and operations as the merchant platform panel.",
    baseUrl: "https://api.fynd.com/service/platform",
    authMethod: "Bearer token via client_credentials OAuth flow",
    accessLevels: {
      company: "Requires company_id. Access to data across entire company including all sales channels.",
      application: "Requires company_id + application_id. Access to data for a specific sales channel."
    },
    authentication: {
      steps: [
        "1. Get Client Id and Client Secret from Platform Panel > Developers > Clients > Create Client",
        "2. Base64 encode '{client_id}:{client_secret}' → base64TokenString",
        "3. POST to /service/panel/authentication/v1.0/company/{company_id}/oauth/token with Authorization: Basic {base64TokenString} and body {grant_type:'client_credentials'}",
        "4. Response contains access_token (Bearer). Use as Authorization: Bearer {access_token} in all API calls."
      ],
      note: "Token is scoped to single company. Use OAuth for extensions."
    },
    modules: {
      company: {
        description: "Billing and subscription management",
        endpoints: ["GET: Obtain charge details", "GET: Retrieve subscription charge details", "POST: Cancel extension subscription", "POST: Generate one-time charge", "POST: Initiate subscription billing"]
      },
      catalog: {
        description: "Products, inventory, categories, brands, bundles, templates, size guides",
        endpoints: ["GET/POST/PUT/DEL: Products (CRUD, bulk upload, variants, HSN/SAC codes)", "GET/POST/PUT/DEL: Inventory (list, create, update, delete, export)", "GET: Categories, Departments, Brands", "GET/POST/PUT: Product Bundles", "GET/POST/PUT: Size Guides", "GET: Product Templates, Attributes"]
      },
      companyProfile: {
        description: "Company profile, brands, selling locations (stores)",
        endpoints: ["GET/PATCH: Company profile", "GET/PUT/POST: Brands", "GET/POST/PUT: Selling locations (stores)", "POST: Bulk create stores", "GET: Store tags"]
      },
      configuration: {
        description: "Currency, custom fields, custom objects, discounts, file storage",
        endpoints: ["GET: Currencies, exchange rates", "GET/POST/PUT/DEL: Custom field definitions", "GET/POST/PUT/DEL: Custom objects", "GET/POST/PUT: Discounts", "POST/GET: File upload, signed URLs, file browse"]
      },
      order: {
        description: "Order creation, shipment management, bag operations",
        endpoints: ["POST: Create order", "GET: Get/List orders", "GET/PUT: Shipment details, address, status, history", "POST: Reassign location, lock shipment, send OTP, retry e-invoice", "GET: List bags, bag cancellation reasons", "POST: Create channel config"]
      },
      serviceability: {
        description: "Courier accounts, delivery zones, packaging, TAT, routing rules",
        endpoints: ["POST/GET/PUT: Courier accounts and rules", "GET/POST/PUT: Delivery zones", "POST/GET/PATCH: Packaging materials and rules", "POST/GET: Locality TAT import/export, bulk serviceability update", "POST: COD pincode updates", "GET/POST/PUT: Store routing rules"]
      },
      webhook: {
        description: "Webhook subscriber registration and management",
        endpoints: ["POST/PUT: Register/update subscriber", "GET: List subscribers by company or extension ID", "GET: Get subscriber details"]
      },
      applicationLevel: {
        description: "Application-scoped APIs (require application_id) — Cart, Catalog, Content, Payments, Orders, Theme, User",
        cart: ["Cart serviceability check", "Abandoned carts", "Add/update cart items", "Share cart", "Coupons CRUD", "Promotions CRUD", "Customer addresses", "Payment mode selection", "Price adjustments", "Checkout", "Delivery modes"],
        catalog: ["Sales channel brands, categories, departments", "Collections CRUD", "Product details, inventory, discounted inventory", "Sales channel cataloging config (listing/group config)", "Sales channel products update"],
        content: ["Blog CRUD", "Custom fields and objects", "FAQ categories and items CRUD", "Landing/legal/navigation pages CRUD", "Path redirection rules", "SEO settings and markup schemas", "Sitemap configuration"],
        payment: ["Payment session get/update", "Payment links (create, get, poll, resend, cancel)", "Refund accounts and beneficiaries", "POS payment confirmation"],
        order: ["List and get sales channel shipments", "Track shipment", "List cancellation reasons", "RMA rules"],
        theme: ["Get/update applied theme", "Extension sections", "Theme pages update"],
        user: ["List/create/update/block/archive users", "User attribute definitions CRUD", "User groups CRUD", "User sessions management", "Platform config get/update"],
        partner: ["Create/remove extension proxy paths"]
      }
    }
  },
  storefrontApi: {
    description: "Storefront REST API (Application API) — customer-facing storefront data. Same data customers see when browsing.",
    baseUrl: "https://api.fynd.com/service/application",
    authMethod: "Basic auth using application_id and application_token",
    authentication: {
      steps: [
        "1. Get application_id and application_token from Platform Panel > Developers > Application Token",
        "2. Base64 encode '{application_id}:{application_token}' → base64TokenString",
        "3. Pass Authorization: Basic {base64TokenString} in every request"
      ],
      note: "No OAuth needed. Credentials scoped to a specific sales channel (application)."
    },
    modules: {
      cart: {
        description: "Cart, checkout, coupons, promotions, addresses, payment modes",
        endpoints: ["GET/POST/PUT/DEL: Cart CRUD, items, metadata, share", "POST: Checkout", "GET/POST/DEL: Coupons apply/remove/validate", "GET/POST/PUT/DEL: Customer addresses", "PUT: Payment mode selection", "GET: Promotions and offers", "POST: Reward points", "GET: Shipments from cart"]
      },
      catalog: {
        description: "Product browsing, brands, categories, collections, departments, search",
        endpoints: ["GET: Products (detail, sizes, variants, price, stock, bundles, sellers)", "GET: Brands, Categories, Collections, Departments", "GET: Autocomplete suggestions", "GET: Selling locations / stores with inventory", "GET: Product comparison, similar products, frequently bought"]
      },
      user: {
        description: "Customer login, registration, profile, OTP, social login",
        endpoints: ["POST: Login (mobile OTP, email+password, token, Facebook, Google, Apple)", "POST: Register with form", "POST/GET/PUT/DEL: Profile (email, mobile, edit details)", "POST: OTP send/verify for login and forgot password", "GET: Logged-in user, active sessions", "POST: Reset password via email/mobile/code"]
      },
      order: {
        description: "Customer order history, shipment tracking, returns",
        endpoints: ["GET: List customer orders, get order details", "GET/PUT: Shipment details, track, update status", "GET: Invoice, cancellation reasons", "POST: Send/verify OTP for shipment"]
      },
      payment: {
        description: "Payment aggregators, cards, wallets, refunds, payment links, order payments",
        endpoints: ["GET: Payment aggregators, modes, POS modes", "POST/GET: Start/update payment, verify", "GET/POST/DEL: Cards management", "GET/POST: Payment links (create, poll, cancel, resend)", "GET/POST: Refund beneficiaries, add via OTP", "GET/POST: Wallet link/delink/OTP verify", "GET: Credit summary, credit availability"]
      },
      configuration: {
        description: "Sales channel config, currencies, languages, selling locations, staff",
        endpoints: ["GET: Sales channel details, owner, features, contact, API tokens", "GET: Currencies, languages", "GET: Order-enabled selling locations", "GET: Staff members"]
      },
      content: {
        description: "Storefront content — blogs, FAQs, pages, navigation, banners, SEO",
        endpoints: ["GET: Blogs, FAQs, FAQ categories", "GET: Custom pages, landing pages, legal pages", "GET: Navigation items", "GET: Announcements, slideshows, HTML tags", "GET: SEO settings, sitemap config, markup schemas"]
      },
      logistic: {
        description: "Pincode/locality details, delivery promise, courier partners",
        endpoints: ["GET: Pincode details, countries, localities, country details", "POST: Validate address", "POST: Serviceable courier partners", "POST: Product turnaround time", "GET: Delivery promise"]
      },
      communication: {
        description: "Consent management, push notification tokens",
        endpoints: ["GET/POST: Consent status and settings", "POST: App push token"]
      },
      rewards: {
        description: "Loyalty points, referrals, order discounts",
        endpoints: ["GET: Points history, current points, referral details", "POST: Redeem code, order from catalogue, order discount"]
      }
    }
  },
  faq: [
    { q: "how are coupons and promotions stored", a: "Managed under Megatron (Cart service). Stored at Application level keyed by application_id. Fynd backend uses MongoDB. v1.9.5: Maker-Checker approval flow introduced. v2.1.0: coupon support extended to Buy Now checkout. Contact: Primary @Apoorva, Backup @Arunoday Ray." },
    { q: "how does maker checker work", a: "Introduced in v1.9.5 under Megatron. Creator role creates coupons/promotions. Reviewer role approves. Members with both roles have full control. Prevents unauthorized fraud in promotion management." },
    { q: "what is mto", a: "Made To Order. v1.9.5: MTO tag added to OMS, default auto-lock removed. v2.1.0: bulk update MTO to non-MTO via catalogue. Service: OMS (Avis/Computron). Primary: Shivam Arora." },
    { q: "what is stormbreaker", a: "Serviceability service — zones, GeoAreas, courier rules, pincode COD, TAT, packaging, fulfillment options. v2.0.0: Reverse Pickup added for independent return serviceability. Primary: Apoorva." },
    { q: "what is megatron", a: "Cart service — Cart, Checkout, Promotions, Coupons. v1.9.5: Maker-Checker, prepaid discounts. v2.1.0: Buy Now coupon support. Primary: Apoorva, Backup: Arunoday Ray." },
    { q: "what is gringotts", a: "Payments service — gateways, payment links, refunds, POS payments, aggregator integrations. v1.9.5: Payment Link for Store OS. v2.1.0: dynamic E-mandate, slug validation. Primary: Shivam Arora." },
    { q: "what changed in v2.0.0", a: "v2.0.0 (Nov 2024): Manual Order Creation in OMS, Custom OMS Lane Views, StoreOS Extensions (pages/popups), Reverse Pickup serviceability, Partner Panel Audit Trail, Fynd Utilities no-code apps." },
    { q: "what changed in v2.1.0", a: "v2.1.0 (Dec 2024): Detailed Price Breakdown in OMS, Bulk MTO update, Coupon in Buy Now checkout, Shipment tags (SAME DAY/NEXT DAY/HYPERLOCAL), 3-month OMS download, bulk multi-valued attribute management." },
    { q: "manual order creation", a: "Introduced in v2.0.0 under OMS (Avis/Computron). Create orders manually for telephonic sales, special requests, offline campaigns. Supports custom price, fulfillment location, payment mode. Primary: Shivam Arora." },
    { q: "same day delivery tag", a: "Introduced in v2.1.0 under OMS. Auto-applied: SAME DAY DELIVERY (order date = promise date), NEXT DAY DELIVERY (promise = order+1), HYPERLOCAL (same day + within 5 hours). Primary: Shivam Arora." },
    { q: "how to authenticate with platform api", a: "Use client_credentials OAuth flow. Step 1: Get Client Id + Client Secret from Platform Panel > Developers > Clients. Step 2: Base64 encode '{client_id}:{client_secret}'. Step 3: POST to /service/panel/authentication/v1.0/company/{company_id}/oauth/token with Authorization: Basic {base64} and body {grant_type:'client_credentials'}. Step 4: Use returned access_token as Bearer token in all API calls. Token is scoped to one company. For extensions, use OAuth instead." },
    { q: "how to authenticate with storefront api", a: "Use Basic auth with application credentials. Step 1: Get application_id and application_token from Platform Panel > Developers > Application Token. Step 2: Base64 encode '{application_id}:{application_token}'. Step 3: Pass Authorization: Basic {base64TokenString} in every request. No OAuth needed. Scoped to a specific sales channel." },
    { q: "difference between platform api and storefront api", a: "Platform API: merchant/admin side, requires Bearer token via OAuth/client_credentials, operates at company level or application level, used for managing products, orders, inventory, users. Storefront API (Application API): customer-facing, uses Basic auth with application credentials, returns data customers see when browsing — product listings, cart, checkout, order history, promotions." },
    { q: "what apis are available for cart and checkout", a: "Platform API (application-level): Cart serviceability, abandoned carts, coupon/promotion CRUD, price adjustments, customer addresses, payment mode, delivery modes. Storefront API: Cart CRUD, add/update items, checkout, apply/remove coupons, select payment mode, reward points, promotions offers. DRI: Apoorva (Megatron)." },
    { q: "what apis are available for orders and shipments", a: "Platform API: Create order, list/get orders, shipment status update, reassign location, lock/unlock shipment, OTP verify, e-invoice retry, bag operations. Storefront API: Customer order history, shipment tracking, invoice, update shipment status, send/verify OTP. DRI: Shivam Arora (OMS - Avis/Computron)." },
    { q: "what apis are available for serviceability", a: "Platform API (company-level): Courier account setup, delivery zones, packaging materials, TAT import, routing rules, COD pincode management. Storefront API: Pincode details, deliverable countries, localities, courier partners, delivery promise, address validation. DRI: Apoorva (Stormbreaker)." },
    { q: "what apis are available for payments", a: "Platform API: Payment session, payment links, refund accounts, POS payment confirmation. Storefront API: Aggregators, payment modes, cards management, wallet link/delink, payment links, refund beneficiaries, credit summary, order payments (Rupifi, Epaylater banners). DRI: Shivam Arora (Gringotts)." },
    { q: "what apis are available for catalog and products", a: "Platform API: Full product CRUD, bulk upload, inventory CRUD + export, categories, departments, brands, attributes, HSN/SAC codes, product bundles, size guides, templates. Storefront API: Product detail by slug, sizes, variants, price, stock, bundles, sellers, comparison, similar, frequently bought. DRI: Vidit (Frenzy/Wildrider/Martell)." },
    { q: "how to use custom fields api", a: "Both Platform and Storefront APIs support custom fields. Platform API: Define custom field schemas per resource type (product, bag, etc.), create/update/delete definitions and values. Supports HTML type (v1.9.5+). Storefront API: Read custom fields for a resource slug. DRI: Chirag Solanki (FDK)." },
    { q: "how to use webhooks api", a: "Platform API: POST/PUT to register or update a subscriber with event list and delivery URL. GET to list subscribers by company or extension ID. Supported broadcaster types (v1.9.5): GCP PubSub, Amazon SQS, Amazon EventBridge, Temporal (in addition to HTTP). DRI: Chirag Solanki." },
    { q: "client libraries sdk languages", a: "Official SDK client libraries available for: JavaScript, Java, Kotlin, Swift, Python. Recommended to use SDK methods rather than raw HTTP calls. Platform SDK for platform/company APIs, Application SDK for storefront APIs, GraphQL SDK for GraphQL queries. DRI: Chirag Solanki (FDK - Bombshell/Mixmaster/Brainstorm)." },

    // ── Megatron / Cart technical FAQs ───────────────────────────────────────
    { q: "what is verify_article true in megatron", a: "verify_article is a BooleanField on CartArticleWrapper (runtime, not persisted to DB). When True, the article (cart line item) is verified against live inventory before checkout — enforcing a real-time stock check per article. It reads from the VERIFY_ARTICLE config flag in DockerConfig, which is set per environment. In JMD cluster (jmdz0, jmdz5) this check is active. For child items in a bundle, verify_article=True means each child article's availability is individually verified against inventory before the order is placed. This prevents overselling on bundled/parent-child items. DRI: Apoorva (Megatron)." },
    { q: "what is verify_article for child items jmd cluster", a: "In Megatron, verify_article=True on a CartArticleWrapper means that article is verified against live inventory. For child items (referenced via parent_item_identifiers in CartObject), when verify_article=True, each child article within a bundle is individually stock-checked. In the JMD cluster (jmdz0/jmdz5), PRICE_ROUND_OFF_ENABLED is True. The verify_article check fires during cart validation — if valid_inventory becomes False (stock unavailable), is_valid=False and the article is excluded from checkout. This is controlled by VERIFY_ARTICLE config per environment, not hardcoded. DRI: Apoorva." },
    { q: "what is parent_item_identifiers in cart", a: "parent_item_identifiers is a DictField on CartObject (line item). Used for grouped/bundled items — the child item references its parent via this field. When verify_article=True, child items are individually validated against inventory. The parent-child relationship tracks which products are part of a bundle/set. DRI: Apoorva (Megatron)." },
    { q: "what is buy_now in megatron cart", a: "buy_now is a BooleanField on CartBaseClass. When True, the cart is in Buy Now mode — a single-item express checkout that bypasses the standard multi-item cart flow. Introduced in v2.1.0: coupon support was extended to Buy Now checkout. DRI: Apoorva." },
    { q: "how does coupon application work in megatron", a: "Coupon application in Megatron (CouponBaseWrapper): 1) Filter applicable articles by lowest net_price first. 2) strict_rule_match (is_exact=True in rule_definition) caps discount to exact quantity only. 3) Discount cannot exceed total price of applicable articles (cap). 4) Rules ordered by threshold — multiple matches → last one wins. 5) Bank offers require non-COD payment mode. 6) Cashback coupons have action.txn_mode='fynd_cash'. Maker-Checker applies from v1.9.5. DRI: Apoorva." },
    { q: "how does promotion application work in megatron", a: "Promotion application in Megatron (Promotions model): 1) Sorted by date_meta.created_on (oldest first) then apply_priority descending (higher priority first). 2) LADDER_PRICE and CONTRACT promo_groups are excluded from standard queries — special handling. 3) apply_exclusive=True prevents all other promotions. 4) stackable=True allows stacking. 5) MRP promotions tracked separately via mrp_promo_applied flag. 6) Promotions cached by app_id in Redis. DRI: Apoorva." },
    { q: "what is the difference between coupon and promotion in megatron", a: "In Megatron: Coupon (Couponv3 model) — user enters a code, applies a discount/cashback. Has strict rule matching, bank offer support, and email domain restrictions. Promotion (Promotions model) — auto-applied based on cart contents. Has buy_rules (conditions), discount_rules (what discount), apply_priority, stackable flag, and promo_group. Both have return_allowed/cancellation_allowed post-order flags. Managed via Maker-Checker from v1.9.5. DRI: Apoorva." },
    { q: "what is ladder price promotion", a: "LADDER_PRICE is a promo_group in Megatron Promotions. It provides tiered/volume pricing — buy more, pay less. It is excluded from standard promotion queries and has special handling. Uses discount_rules with quantity/amount thresholds. Also tracked via PROMOTION_GROUP.LADDER_PRICE constant. DRI: Apoorva (Megatron)." },
    { q: "what is free gift promotion in megatron", a: "PROMOTION_TYPE.FREE_GIFT_ITEMS — a promotion type in Megatron. When applied, free articles are added to applied_free_articles on ArticlePromotionWrapper with free_quantity. Checked via is_free_gift_applied() on PromotionCartObjWrapper. DISABLE_MULTI_FREE_GIFT_PROMO config flag disables multiple free gift promos in JMP cluster (jmp, jmpz0, jmpz5). DRI: Apoorva." },
    { q: "what is price adjustment in megatron", a: "CartPriceAdjustment model in Megatron — external discounts injected into the cart. Fields: value (amount), type (DISCOUNT/MARKUP), article_level_distribution (spread across articles), allowed_refund (refundable flag), is_active, expire_at (auto-expires 60 days). Applied via price_adjustment_values on CartArticleWrapper. External MOP (method-of-payment) adjustments tracked separately. DRI: Apoorva." },
    { q: "what is anonymous cart in megatron", a: "AnonymousCart — cart for unauthenticated users. Differences from regular Cart: expire_at=90 days (vs 360 for logged-in), is_default always True, empty carts (no articles) NOT saved to DB. On user login, set_cart_user_id() links it to the user. Uses 'anonymous_cart.uid' sequence for IDs. DRI: Apoorva." },
    { q: "what is reserve inventory in megatron", a: "ReserveInventory model — temporary inventory hold for cart items. TTL = 20 minutes (auto-released via pre_update setting expire_at). Scoped per user + cart + article. Enabled via RESERVE_INVENTORY_ENABLED config flag. Prevents overselling during active cart sessions. DRI: Apoorva." },
    { q: "what is to_be_splitted in megatron", a: "to_be_splitted is a BooleanField on CartArticleWrapper (runtime). When True, the article is split into MRP and non-MRP segments for promotion calculation. After splitting, split_article_id is assigned as a unique identifier. Promotions applied to split articles have splitted_promo=True. Used to handle mixed MRP/non-MRP pricing scenarios. DRI: Apoorva." },
    { q: "what is checkout_mode in megatron", a: "checkout_mode is a StringField on CartBaseClass (default='self'). Controls the checkout flow type. 'self' = standard checkout where user completes their own order. The CHECKOUT_MODE config in DockerConfig also sets the default per environment. Related to staff_user_id for admin-created carts. DRI: Apoorva." },
    { q: "what databases does megatron use", a: "Megatron uses: MongoDB (primary data store via umongo ODM) with connections for orbis, megatron, stormbreaker databases. Redis for caching (multiple backends: default, orbis, slingshot, stormbreaker). Kafka for event consumption (Avis consumer, CONSUMER_TYPE=avis). DRI: Apoorva." },
    { q: "what services does megatron depend on", a: "Megatron dependencies: Gringotts (payments, GRINGOTTS_API_POINT), Lightspeed (rewards/loyalty, LIGHTSPEED_MAIN_URL), Deadlock (auth, DEADLOCK_INTERNL_URL), Avis (OMS, consumed via Kafka), Stormbreaker (serviceability, Redis cache), Slingshot (catalog/inventory, Redis cache). DRI: Apoorva." },
    { q: "what is the jmd cluster configuration", a: "JMD cluster in Megatron: environments jmdz0 (staging) and jmdz5 (pre-prod). Config flags: PRICE_ROUND_OFF_ENABLED=True (prices are rounded off). VERIFY_ARTICLE is also active in JMD. JMD is distinct from JMP cluster (which has DISABLE_MULTI_FREE_GIFT_PROMO and PRICE_ROUND_CLIP_ENABLED). DRI: Apoorva." },

    // ── Avis / OMS technical FAQs ─────────────────────────────────────────────
    { q: "what are the bag states in avis oms", a: "Avis OMS has 146 bag states. Key forward flow: placed(1) → bag_confirmed(45) → bag_packed(46) → dp_assigned(26) → in_transit(35) → out_for_delivery(6) → delivery_done(7). Cancellation: cancelled_customer(8), cancelled_fynd(16). Return flow: return_initiated(9) → return_dp_assigned(38) → return_bag_picked(73) → return_accepted(10) → return_completed(61). Refund: refund_requested(127) → refund_initiated(62) → refund_completed(63). RTO: rto_initiated(102) → rto_bag_delivered(76). DRI: Shivam Arora." },
    { q: "what is the difference between bag status and shipment status in avis", a: "In Avis OMS: Bag = individual line item (SKU), tracks its own state (BagStatus, BagStateMapper). Shipment = group of bags fulfilled together, has its own ShipmentStatus and tracking (AWB). A shipment can contain multiple bags. Bag has current_status and current_operational_status. Shipment has lock_status, tags (SAME_DAY_DELIVERY, NEXT_DAY_DELIVERY, HYPERLOCAL), and fulfilment_priority. DRI: Shivam Arora." },
    { q: "when is auto invoice generated in avis", a: "Avis auto-generates invoices for these bag states: bag_confirmed, bag_packed, rto_bag_accepted, return_accepted. Controlled by VIRTUAL_INVOICING config. Invoice stored as store_invoice_id and store_invoice_image on Bag model. E-invoice retry logic uses Redis key EINVOICE_DATA_CHECKS. DRI: Shivam Arora." },
    { q: "what bag states are cancellable in avis", a: "In Avis OMS: Customer AND Fynd can cancel from: placed, bag_not_handed_over_to_dg, bag_rescheduled, dp_assigned, store_reassigned, product_not_available. Fynd only: in_transit, handed_over_to_dg, out_for_delivery. Terminal states (no actions): return_to_store, dead_stock, cancelled_customer, cancelled_fynd, return_initiated, exchange_initiated. DRI: Shivam Arora." },
    { q: "what is shipment tag same day delivery next day delivery hyperlocal", a: "Shipment tags in Avis OMS (v2.1.0): SAME_DAY_DELIVERY (promise date = order date), NEXT_DAY_DELIVERY (promise = order+1 day), HYPERLOCAL (same day + within 5 hours delivery). Tags are auto-applied on the Shipment model via ScalarListType. DRI: Shivam Arora (OMS/Computron)." },
    { q: "what is the difference between fynd and affiliate state transitions in avis", a: "In Avis OMS, StateTransition has identifier field: 'fynd' = direct Fynd orders, 'affiliate' = marketplace orders (AJIO, Myntra, Flipkart, etc.). Different transitions are allowed per identifier. Affiliates have separate affiliate_bag_id, affiliate_order_id, affiliate_shipment_id fields. About 20+ affiliates supported. DRI: Shivam Arora." },
    { q: "how does refund work in avis oms", a: "Avis refund flow: refund_requested(127) → refund_initiated(62) → refund_completed(63) or refund_failed(64) → refund_retry(109). Also: refund_pending_for_approval(107), refund_on_hold(108), manual_refund(138), credit_note_generated(117). Idempotency check via Redis key refund:idempotency:bag:{id} with 3-day TTL (259200s). Gringotts (payments service) processes the actual refund. Repriced refund has separate states (122-128). DRI: Shivam Arora." },
    { q: "what databases does avis oms use", a: "Avis OMS uses: MySQL (mysql_avis_master for write, mysql_avis_slave for read) — primary models. MongoDB: orbis (read-only reference), computron (OMS operational data, read+write), slingshot (catalog), stormbreaker (serviceability, read-only). Redis: redis_avis (primary cache), redis_computron, redis_alohomora (auth/session), redis_slingshot. Kafka for event consumption. DRI: Shivam Arora." },
    { q: "what services does avis depend on", a: "Avis OMS dependencies: Megatron (cart, consumes via Kafka), Gringotts (payments, refunds), Skywarp (internal), Sentinel (notifications/SMS), Grindor (file upload, invoices/labels), Silverbolt (encryption, store reassignment), Stormbreaker (serviceability, MongoDB read-only). DRI: Shivam Arora." },
    { q: "what is computron in avis", a: "Computron is the MongoDB database used by Avis for OMS operational data (read and write). It stores order details, shipment operational state. Separate from orbis (read-only reference DB). Also has redis_computron as a cache layer. Part of Avis/Computron codename pair — the OMS service is collectively known as Avis/Computron. DRI: Shivam Arora." },
    { q: "what is rto in oms", a: "RTO = Return To Origin. Bag states: rto_initiated(102) → rto_in_transit(77) → rto_bag_out_for_delivery(103) → rto_bag_delivered(76) → rto_bag_accepted(78). Triggered when delivery fails (multiple attempts) and courier returns the package to origin store/warehouse. Auto-invoice generated on rto_bag_accepted. DRI: Shivam Arora (OMS)." },
    { q: "what are post pay payment modes in avis", a: "POST_PAY_PAYMENT_MODES = ['COD', 'CDOD', 'FC'] — modes where payment happens after order placement. COD = Cash on Delivery (mode ID 2). FC = Fynd Cash. COD limit: CART_COD_LIMIT=5000, STORE_USER_CART_COD_LIMIT=55000. IGNORE_PAYMENT_MODES_FOR_IOS/ANDROID = ['PT', 'OP']. DRI: Shivam Arora (OMS) + Shivam Arora (Gringotts)." },
    { q: "what is bag_type in avis", a: "bag_type on the Bag model: forward_standard (default regular order), exchange_order (exchange order), fynd_a_fit (try-at-home). Set via TYPE_MAPPING: standard→standard, try_at_home→fynd_a_fit. DRI: Shivam Arora." },
    { q: "what is journey_type in bag in avis", a: "journey_type on Bag model classifies whether the bag is in forward journey (normal delivery) or return journey. Also tracked on BagStateMapper to distinguish forward vs return states. DRI: Shivam Arora." },
    { q: "how does delivery partner assignment work in avis", a: "In Avis OMS: Default DP = DelhiveryAPI (ID=7). Manual DP = fyndr (ID=22). Hyperlocal DP IDs from Redis key 'hyperlocal_dp_ids'. Hyperlocal threshold = 8km. MAX_DELIVERY_DISTANCE = 50000 meters. Additional days: SDD=0, NDD=1. Assignment triggered from ready_for_dp_assignment(116) state. dp_assigned(26) is set after successful assignment. dp_not_assigned(44) if assignment fails. DRI: Apoorva (Stormbreaker for rules) + Shivam Arora (OMS)." }
  ]
};
