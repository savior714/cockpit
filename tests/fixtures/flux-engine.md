# Flux Engine

## Project Map

### Storage Subsystem

#### In-Memory Buffering
- **Memory Buffer Pool** — Zero-copy off-heap buffer ring for packet ingestion

#### Persistent Journal
- **Write Ahead Log** — Append-only durable segment log with group commit

### Distributed Consensus & Replication

#### Consensus Engine
- **Raft State Machine** — Distributed consensus for partition leader election

#### Current Stage
- **Partition Rebalancing Under Failure** — Node crash recovery and seamless partition redistribution

#### Sync Protocol
- **Deterministic Log Replication** — Intra-cluster synchronous follower replication

### Cloud Storage & WAN

#### Archival Subsystem
- **Tiered Storage Offload** — Automated migration of sealed log segments to object storage

#### Geo-Replication
- **Cross-Region Replication** — Active-passive asynchronous replication across cloud regions

## Area Details

### Memory Buffer Pool

#### Meaning
Off-heap memory arena ensuring zero-allocation telemetry during peak ingestion.

#### Current Level
Pre-allocated 4GB direct byte buffer ring tested with up to 1M msgs/sec.

#### Remaining Issues
- Chunk recycling fragmentation under variable message size workloads

#### Evidence
- JMH microbenchmark suite (`BufferPoolBenchmark.java`) passes on 64-core testbed.

### Write Ahead Log

#### Meaning
Append-only disk journaling layer with direct I/O and fsync batching.

#### Current Level
Segment rollover and CRC32 verification complete.

#### Remaining Issues
- NVMe drive sync latency tail (p99.9 > 15ms) under heavy concurrent read load

#### Evidence
- Jepsen test run `wal-crash-recovery` completed 500 fault injection cycles with 0 data loss.

### Raft State Machine

#### Meaning
Raft protocol implementation for cluster metadata and leader election.

#### Current Level
3-node and 5-node cluster quorum election fully operational.

#### Remaining Issues
- Split-brain edge case handling during network partition heal

#### Evidence
- Maelstrom distributed testing suite pass rate 100% on partition tests.

### Partition Rebalancing Under Failure

#### Meaning
Automatic partition reassignment and lease handover when a broker node crashes.

#### Current Level
Leader failover completes within 2.5 seconds, lease transfer protocol implemented.

#### Remaining Issues
- Transient duplicate message delivery during dirty leader transition
- Client connection backoff storm on large cluster topology changes

#### Evidence
- Chaos engineering suite (Chaos Mesh) pod kill drills: MTTR 2.3s recorded.

### Deterministic Log Replication

#### Meaning
Follower node log sync with strict deterministic ordering.

#### Current Level
Verified across 3 availability zones.

#### Remaining Issues
- Catch-up replication throttling when follower is severely lagged

#### Evidence
- Continuous integration replication test suite `test_replication_catchup.py`.

### Tiered Storage Offload

#### Meaning
Automated migration of sealed log segments to object storage.

#### Current Level
Architecture RFC approved, storage interface trait defined.

#### Remaining Issues
- Remote index lookup performance under cold read queries

#### Evidence
- RFC-108 Storage Tiering Specification.

### Cross-Region Replication

#### Meaning
Active-passive asynchronous replication across cloud regions.

#### Current Level
Initial requirement gathering.

#### Remaining Issues
- WAN bandwidth cost estimation and compression algorithm evaluation

#### Evidence
- Preliminary design document `docs/design/wan-replication.md`.

## Current Situation
Testing partition rebalancing under simulated hard node kills. Lease handover works within 2.5s, but transient duplicate detection is being patched.

## Next Transition
Close duplicate delivery edge case in lease handover and proceed to benchmark client backoff behaviors.

## Facing Issues
- **Duplicate Delivery**: Race condition between client retry and leader epoch increment during partition handoff.

## Product Goals
High-throughput distributed event broker delivering sub-millisecond p99 latency with strictly verified linearizability.

## Settled Direction
- Zero-copy off-heap memory model: settled 2026-06-15
- Pluggable consensus engine abstraction rejected in favor of integrated Raft: settled 2026-07-02
