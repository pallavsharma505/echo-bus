import type { ServerWebSocket } from "bun";
import type { ClientData } from "./ConnectionManager";
import type { TopicInfo } from "./types";

export class SubscriptionManager {
  // topic -> Set of client IDs
  private subscriptions = new Map<string, Set<string>>();
  // Track durable topics
  private durableTopics = new Set<string>();

  subscribe(topic: string, clientId: string): void {
    let subs = this.subscriptions.get(topic);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(topic, subs);
    }
    subs.add(clientId);
  }

  unsubscribe(topic: string, clientId: string): void {
    const subs = this.subscriptions.get(topic);
    if (subs) {
      subs.delete(clientId);
      if (subs.size === 0 && !this.durableTopics.has(topic)) {
        this.subscriptions.delete(topic);
      }
    }
  }

  removeClient(clientId: string): string[] {
    const removedFrom: string[] = [];
    for (const [topic, subs] of this.subscriptions) {
      if (subs.delete(clientId)) {
        removedFrom.push(topic);
        if (subs.size === 0 && !this.durableTopics.has(topic)) {
          this.subscriptions.delete(topic);
        }
      }
    }
    return removedFrom;
  }

  /** Get subscriber IDs matching a topic, including wildcard patterns */
  getSubscribers(topic: string): string[] {
    const matched = new Set<string>();

    for (const [pattern, subs] of this.subscriptions) {
      if (this.topicMatches(pattern, topic)) {
        for (const id of subs) {
          matched.add(id);
        }
      }
    }

    return Array.from(matched);
  }

  /** Check if a subscription pattern matches a topic */
  private topicMatches(pattern: string, topic: string): boolean {
    if (pattern === topic) return true;

    const patternParts = pattern.split(".");
    const topicParts = topic.split(".");

    // '#' matches zero or more segments
    if (patternParts.includes("#")) {
      const hashIdx = patternParts.indexOf("#");
      const beforeHash = patternParts.slice(0, hashIdx);
      const afterHash = patternParts.slice(hashIdx + 1);

      // Check prefix
      for (let i = 0; i < beforeHash.length; i++) {
        if (i >= topicParts.length) return false;
        if (beforeHash[i] !== "*" && beforeHash[i] !== topicParts[i]) return false;
      }

      // Check suffix
      for (let i = 0; i < afterHash.length; i++) {
        const topicIdx = topicParts.length - afterHash.length + i;
        if (topicIdx < 0) return false;
        if (afterHash[i] !== "*" && afterHash[i] !== topicParts[topicIdx]) return false;
      }

      return topicParts.length >= beforeHash.length + afterHash.length;
    }

    // '*' matches exactly one segment
    if (patternParts.length !== topicParts.length) return false;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === "*") continue;
      if (patternParts[i] !== topicParts[i]) return false;
    }

    return true;
  }

  markDurable(topic: string): void {
    this.durableTopics.add(topic);
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
  }

  isDurable(topic: string): boolean {
    return this.durableTopics.has(topic);
  }

  get topicCount(): number {
    return this.subscriptions.size;
  }

  getTopics(): TopicInfo[] {
    const result: TopicInfo[] = [];
    for (const [name, subs] of this.subscriptions) {
      result.push({
        name,
        subscriberCount: subs.size,
        durable: this.durableTopics.has(name),
        messageCount: 0, // Will be populated by persistence layer
      });
    }
    return result;
  }

  getAllTopicNames(): string[] {
    return Array.from(this.subscriptions.keys());
  }
}
