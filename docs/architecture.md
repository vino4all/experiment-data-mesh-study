# Architecture Overview

## System Architecture

The experimental platform consists of four main components:

### 1. Client Domain (Data Producer)

- **Client Service** (Node.js + Express)
  - HTTP API for client management
  - Kafka producer emitting client events
  - PostgreSQL database (client_db)
  - Metrics: Request latency, event emission rate

- **Client Database** (PostgreSQL)
  - Tables: `clients`, `client_events`
  - Tracks all client updates and change history

### 2. Orders Domain (Data Consumer)

- **Orders Service** (Node.js + Express)
  - Handles three pattern endpoints simultaneously
  - HTTP API for order management
  - Pattern A: Direct API client calls
  - Pattern B: Reads from local projection
  - Pattern C: Reads from batch ODS
  - Metrics: Request latency, API pressure, data freshness

- **Orders Database** (PostgreSQL)
  - Tables: `orders`, `orders_client_projection`, `orders_batch_client_ods`
  - Pattern A: Foreign key reference only
  - Pattern B: Event-driven projection table
  - Pattern C: Batch ODS table

### 3. Event Streaming & Synchronization

- **Kafka Cluster** (Redpanda)
  - Topic: `client-events`
  - Partitions: 1 (single partition for ordering)
  - Replication factor: 1
  - Used by Pattern B consumer

- **Orders Projection Consumer** (Node.js)
  - Consumes from Kafka topic
  - Updates `orders_client_projection` table
  - Tracks offset state for replay capability
  - Implements idempotency and replay handling
  - Metrics: Consumer lag, projection update latency

- **Batch Sync Worker** (Node.js)
  - Scheduled batch sync (default: 30s interval)
  - Reads from Client database
  - Writes to Orders ODS table
  - Metrics: Sync duration, rows processed, error rate

### 4. Monitoring & Observability

- **Prometheus** (9090)
  - Scrapes metrics from all services
  - Stores time-series data
  - Retention: Default (15 days)

- **Grafana** (3000)
  - Visualizes Prometheus metrics
  - Pre-configured dashboards
  - Real-time pattern comparison

- **Kafka UI** (8080)
  - Visual Kafka cluster monitoring
  - Topic inspection, consumer lag tracking

## Data Flow Diagrams

### Pattern A: Direct API Consumption

```
┌────────────────┐
│ Load Test (k6) │
└────────┬────────┘
         │ (1) GET /orders/1/api-pattern
         ▼
┌────────────────────┐
│ Orders Service     │
│ (Pattern A route)  │
├────────────────────┤
│ 1. Fetch order     │
│    from orders_db  │
└────────┬───────────┘
         │ (2) GET /clients/{client_id}
         ▼
┌────────────────────┐
│ Client Service     │
├────────────────────┤
│ 1. Fetch client    │
│    from client_db  │
│ 2. Return JSON     │
└────────┬───────────┘
         │ (3) HTTP Response
         ▼
┌────────────────────┐
│ Orders Service     │
├────────────────────┤
│ 1. Combine data    │
│ 2. Record latency  │
│ 3. Return response │
└────────┬───────────┘
         │ (4) HTTP Response (latency_ms)
         ▼
┌────────────────────┐
│ k6 Metrics         │
│ - API latency      │
│ - Success rate     │
│ - Freshness: 0ms   │
└────────────────────┘
```

**Latency Path**: Load Test → Orders Service (1ms) → Client Service (2-50ms) → Network (1-20ms) = 5-72ms

**Freshness**: Real-time (data fetched on-demand)

### Pattern B: Event-Driven Projection

```
┌────────────────────┐
│ Client Service     │
├────────────────────┤
│ 1. Update client   │
│ 2. Emit event      │
│ 3. Send to Kafka   │
└────────┬───────────┘
         │ client.updated event
         ▼
┌────────────────────┐
│ Kafka Topic        │
│ client-events      │
└────────┬───────────┘
         │ (async) consume
         ▼
┌──────────────────────────────┐
│ Projection Consumer          │
│ (orders-projection-consumer) │
├──────────────────────────────┤
│ 1. Receive event             │
│ 2. Deserialize JSON          │
│ 3. Check idempotency         │
│ 4. UPDATE projection table   │
│ 5. Track offset              │
└──────────┬───────────────────┘
           │ INSERT/UPDATE
           ▼
┌────────────────────┐
│ orders_db          │
│ projection table   │
└─────────┬──────────┘
          │ (async, non-blocking)
          │
          └─────────────────────────┐
                                    │
Load Test (k6)                      │
         │ GET /orders/1/projection-pattern
         ▼
┌────────────────────┐
│ Orders Service     │
│ (Pattern B route)  │
├────────────────────┤
│ 1. Fetch order     │
│    from orders_db  │
│ 2. Fetch projection│
│    from projection │
│ 3. Calculate lag   │
└────────┬───────────┘
         │ (Response with freshness info)
         ▼
┌────────────────────┐
│ k6 Metrics         │
│ - Read latency: 1-5ms
│ - Projection lag   │
│ - Stale reads %    │
└────────────────────┘
```

**Latency Path**: Load Test → Orders Service (1ms) → Query projection (0.5-2ms) = 1.5-3ms

**Freshness**: Event propagation delay (100ms - 5s depending on consumer lag)

### Pattern C: Batch Replication

```
Periodic (every 30s):
┌────────────────────┐
│ Batch Sync Worker  │
├────────────────────┤
│ 1. Connect to      │
│    client_db       │
│ 2. SELECT clients  │
│ 3. Transform       │
└────────┬───────────┘
         │ READ
         ▼
┌────────────────────┐
│ client_db          │
│ (Source)           │
└────────┬───────────┘
         │ (5-50 rows)
         ▼
┌────────────────────┐
│ Batch Sync Worker  │
├────────────────────┤
│ 1. Parse rows      │
│ 2. Transform schema│
│ 3. Build bulk SQL  │
│ 4. Execute upsert  │
└────────┬───────────┘
         │ INSERT/UPDATE (upsert)
         ▼
┌────────────────────┐
│ orders_db          │
│ batch ODS table    │
└─────────┬──────────┘
          │ (marks timestamp)
          │
Load Test (k6)
         │ GET /orders/1/batch-pattern
         ▼
┌────────────────────┐
│ Orders Service     │
│ (Pattern C route)  │
├────────────────────┤
│ 1. Fetch order     │
│ 2. Fetch ODS row   │
│ 3. Calculate age   │
│ 4. Return response │
└────────┬───────────┘
         │ (Response with batch_imported_at)
         ▼
┌────────────────────┐
│ k6 Metrics         │
│ - Read latency: 0.5-2ms
│ - Batch age lag    │
│ - No fresh data    │
│ - Full decoupling  │
└────────────────────┘
```

**Latency Path**: Load Test → Orders Service (1ms) → Query ODS (0.5-1ms) = 1.5-2ms

**Freshness**: Batch interval dependent (30s ± 5s for processing)

## Synchronization State Tracking

### Pattern B: Kafka Consumer State

```sql
-- orders_projection_consumer_state table
consumer_group: "orders-projection-group"
last_offset: 12345
last_processed_at: 2024-01-15 10:30:45
```

**Purpose**: Enable replay and idempotency
- Tracks last successfully processed offset
- On restart, consumer seeks to (last_offset + 1)
- Replay from beginning available via Kafka retention

### Pattern C: Batch Sync State

```sql
-- orders_batch_sync_state table
sync_id: 67890
sync_status: "completed" | "in_progress" | "failed"
rows_processed: 125
started_at: 2024-01-15 10:30:00
completed_at: 2024-01-15 10:30:04
error_message: null
```

**Purpose**: Track sync progress and recovery
- One row per sync cycle
- Enables resume-from-failure
- Error tracking for debugging

## Metric Collection Architecture

### Prometheus Scrape Configuration

```yaml
scrape_configs:
  - job_name: 'client-service'
    static_configs:
      - targets: ['client-service:3001']
    metrics_path: '/metrics'
    
  - job_name: 'orders-service'
    static_configs:
      - targets: ['orders-service:3002']
    metrics_path: '/metrics'
```

### Service-Level Metrics Emission

Each service exposes:
- HTTP request histograms
- Pattern-specific counters
- Kafka message counters
- Application business metrics

### Prometheus Query Examples

```promql
# Pattern A latency p95
histogram_quantile(0.95, api_latency{pattern="a"})

# Pattern B projection lag
projection_lag_ms{pattern="b"}

# Batch sync duration
batch_sync_duration_ms{status="success"}

# API call pressure (requests/sec)
rate(api_call_metrics{pattern="a"}[1m])
```

## Error Handling & Recovery

### Pattern A: Cascading Failures
- Client service down → Orders API returns 503
- Timeout after 5s
- Metrics: failure counter incremented

### Pattern B: Consumer Lag Recovery
- Kafka broker down → Consumer pauses
- Retries connection (exponential backoff)
- Replays from last offset on recovery
- Idempotency prevents duplicate updates

### Pattern C: Batch Sync Failures
- Database connection error → Retry in 30s
- Partial sync (some rows fail) → Log errors, continue
- Full sync failure → Skip cycle, retry next interval
- Metrics: error counter, sync status tracked

## Performance Expectations

| Component | Latency | Throughput | Notes |
|-----------|---------|-----------|-------|
| Client Service API | 1-50ms | 1000 req/s | CPU-bound on serialization |
| Orders Service Query | 0.5-2ms | 10000 req/s | Network I/O dominant |
| Projection Consumer | 1-5ms | 1000 msg/s | I/O + parsing |
| Batch Sync | 2-10s | N/A | Periodic, not request-driven |
| Kafka Broker | <1ms | 100000 msg/s | Local network |

## Scaling Considerations

To extend this architecture:

1. **Multiple partitions** (Kafka): Parallelizes consumer group
2. **Multiple consumers** (Pattern B): Requires partition-level ordering
3. **Materialized view replicas** (Pattern B): Read-heavy caching layer
4. **Batch compression** (Pattern C): Gzip payload before transfer
5. **CDC-based replication** (Pattern C): Debezium for CDC streams
