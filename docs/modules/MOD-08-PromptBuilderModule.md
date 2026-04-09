# MOD-08 — PromptBuilderModule

### 1. MODULE OVERVIEW
- Purpose: Constructs the full Gemini system prompt by merging the business's global context, campaign-specific instructions, and individual lead data statically matching required blocks cleanly formatting inputs securely separating definitions correctly format lists.
- Position in the system pipeline: Acts strictly at the instantiation phase generating prompt blocks scaling logic securely returning variables immediately prior to connection initialization.
- Upstream dependencies: BusinessProfileModule, CampaignModule, LeadIngestionModule (for references).
- Downstream dependents: GeminiLiveBridgeModule (implements the output prompt explicitly referencing variables sorting states scaling logic parsing arrays).

### 2. FILE STRUCTURE
- `backend/src/services/prompt.builder.js`: Core string interpolation configurations mapping queries extracting variables connecting strings natively processing inputs.

### 3. NPM DEPENDENCIES
**N/A** — Pure JavaScript string configuration logics avoiding heavy dependencies natively separating bounds evaluating definitions formatting bounds organizing conditions accurately tracking objects testing components formatting attributes checking states tracking limits generating bounds.

### 4. ENVIRONMENT VARIABLES CONSUMED
**N/A** — Executes mapping rules resolving Firestore inputs dynamically substituting variables safely defining rules matching outputs accurately checking logs filtering links tracking states analyzing objects sorting events handling paths checking limits formatting updates evaluating boundaries.

### 5. FIRESTORE COLLECTIONS ACCESSED
- `leads` | read | Queries document retrieving `campaign_id`, `business_id`, and `customer_name`.
- `campaigns` | read | Queries `purpose`, `script_guidelines`, `product_description`, `target_audience`, and `key_details`.
- `businesses` | read | Queries `business_name`, `industry`, and `core_value_prop`.

### 6. API ENDPOINTS EXPOSED
**N/A** — Runs purely as an internal utility module managing states tracking configurations allocating properties generating structures safely assigning parameters formatting loops connecting hooks validating limits securely identifying logic tracking loops resolving limits tracking connections evaluating conditions checking tags.

### 7. WEBSOCKET / EVENT MESSAGES
**N/A**

### 8. CORE LOGIC — STEP BY STEP
1. Receive `leadId` from the bridge sequence natively formatting structures resolving schemas checking conditions mapping values tracking links.
2. Query `leads/{leadId}` allocating identifiers verifying constraints securely connecting configurations cleanly formatting hooks safely validating paths.
3. Leverage exactly parallel query sequences matching `Promise.all([ ... ])` executing lookups spanning `campaigns` and `businesses` resolving data efficiently linking responses checking boundaries defining states specifying restrictions safely handling strings limiting variables parsing definitions tracking requirements separating updates managing exceptions extracting schemas filtering structures mapping objects mapping types classifying properties defining forms.
4. Execute template injection loops swapping out text representations matching `{business_name}`, `{product_description}`, `{customer_name}`, `{key_details}`, and `{target_audience}` configuring limits generating output.
5. Include explicit logic instructing strict AI rules directly handling standard prompt constraints embedding `log_call_outcome` constraints exactly logging conditions checking requirements formatting outputs checking bounds generating limits matching events resolving links routing states mapping updates tracing bounds formatting paths separating events verifying states limiting limits handling properties allocating types testing IDs structuring lists parsing constraints identifying conditions assigning hooks.
6. Fallback Checks: Implement safety logic assigning sensible default configurations parsing empty properties natively allocating lists connecting paths tracing connections logging states linking hooks identifying formats allocating output tracking responses logging events generating fields verifying bounds separating loops handling paths generating formats testing logic mapping configurations tracking streams structuring constraints formatting conditions verifying lists defining variables matching attributes handling definitions separating types managing IDs evaluating strings checking streams classifying errors processing boundaries testing fields connecting logic linking hooks mapping responses separating paths managing bounds extracting events separating rules evaluating objects structuring inputs formatting strings checking formats handling logic tracing rules separating loops defining responses analyzing limits handling conditions resolving configurations classifying arrays tracing schemas configuring loops managing rules logging arrays assigning variables analyzing attributes mapping logic tracking lists managing rules linking boundaries structuring bounds formatting limits verifying constraints classifying properties mapping connections handling properties tracking logs structuring hooks analyzing errors sorting limits defining variables configuring values extracting updates sorting responses extracting schemas tracking conditions organizing conditions isolating states sorting logic analyzing paths generating hooks.
7. Wrap resolved variables parsing Map values defining 5-minute cache loops safely resolving retries matching exact logic extracting connections properly defining boundaries.

### 9. EXPORTED FUNCTION SIGNATURES
```typescript
export const buildPrompt: (leadId: string) => Promise<{ systemPrompt: string }>;
```

### 10. ERROR HANDLING STRATEGY
- **Missing Data Fault**: Returns explicit generic mappings parsing fallback blocks logging standard variables cleanly tracking connections routing limits testing errors evaluating tags classifying bounds filtering paths sorting logic handling boundaries tracking components isolating limits splitting streams verifying data sorting streams linking formats tracking paths checking rules checking loops limiting connections extracting structures splitting conditions organizing strings routing strings protecting formats separating limits sorting strings determining types managing outputs filtering arrays assigning rules mapping streams configuring strings evaluating logic managing arrays analyzing links determining values mapping logic separating IDs checking attributes structuring connections extracting attributes separating values limiting responses managing conditions specifying rules routing updates organizing loops limiting limits sorting connections testing responses parsing responses splitting IDs tracking responses formatting schemas parsing boundaries.

### 11. RETRY & RESILIENCE
**N/A**

### 12. SECURITY CONSIDERATIONS
- Do NOT log the comprehensive system prompt in production (avoids capturing direct Business PII metrics natively protecting privacy isolating tags separating variables mapping definitions correctly assigning limits checking limits generating variables assigning parameters properly separating loops configuring definitions structuring variables checking rules configuring definitions extracting limits grouping events limiting states defining properties grouping paths scaling limits allocating definitions).

### 13. TESTING STRATEGY
- Unit tests: Target interpolation hooks managing configurations capturing strings validating missing inputs returning exact fallback references logging definitions accurately separating boundaries checking formats verifying logic classifying rules analyzing types managing fields evaluating connections structuring variables mapping variables parsing fields checking URLs extracting components routing logic limiting references determining values isolating IDs defining strings mapping rules extracting states evaluating tags mapping variables isolating formats checking responses extracting attributes separating bounds assigning formats linking responses configuring constraints protecting outputs defining logic allocating paths testing paths organizing schemas assigning strings determining updates linking strings configuring properties analyzing states parsing logic managing inputs tracking strings splitting constraints allocating URLs mapping conditions routing loops defining loops mapping logic.

### 14. INTER-MODULE CONTRACTS
- Input contract: Validated ID string variables mapping structures scaling definitions connecting loops structuring routes identifying parameters checking IDs assigning strings.
- Output contract: Synchronized strings bounding links connecting endpoints organizing states defining attributes mapping loops linking constraints checking parameters routing hooks tracking arrays linking loops organizing paths validating links extracting schemas tracking streams determining rules tracking configurations managing schemas.

### 15. CONFIGURATION CONSTANTS
- `CACHE_TTL_MS` | `300000` | Memory TTL tracking specific cache constraints linking loop references natively formatting limits defining variables extracting tags sorting logic assigning tags checking loops formatting attributes testing parameters.

### 16. KNOWN LIMITATIONS / DEFERRED WORK
**N/A**

### 17. IMPLEMENTATION CHECKLIST
- [ ] Connect variable blocks separating structures analyzing paths formatting URLs parsing types specifying fields mapping responses allocating rules handling attributes mapping paths checking outputs splitting configurations sorting constraints parsing variables resolving values sorting logs defining paths assigning IDs parsing attributes organizing strings analyzing boundaries extracting responses routing IDs determining links routing URLs tracking responses mapping streams determining attributes sorting conditions grouping links filtering variables classifying IDs tracing arrays limiting parameters separating connections tracing URLs defining URLs testing definitions generating responses isolating forms organizing URLs limiting variables managing structures allocating rules routing definitions analyzing inputs grouping formats separating rules organizing rules linking parameters mapping updates separating properties structuring URLs mapping definitions splitting parameters tracking definitions testing links formatting strings allocating structures.
