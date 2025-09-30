#!/usr/bin/env node

import fetch from 'node-fetch';

const MCP_URL = 'https://mcpagents-633619052458.us-central1.run.app/jsonrpc';

class MCPStressTest {
  constructor() {
    this.results = {
      total: 0,
      success: 0,
      errors: 0,
      timeouts: 0,
      durations: [],
      errorDetails: []
    };
  }

  async singleRequest(requestId, question) {
    const startTime = Date.now();
    
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: 'autonomous_ask',
        arguments: {
          question: question,
          temperature: 0.7,
          maxTokens: 500,
          includeProjectContext: false
        }
      }
    };

    try {
      console.log(`🚀 [${requestId}] Starting request: "${question.substring(0, 50)}..."`);
      
      const response = await fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        timeout: 120000 // 2 minutos timeout
      });

      const duration = Date.now() - startTime;
      this.results.durations.push(duration);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(`MCP Error: ${result.error.message}`);
      }

      this.results.success++;
      console.log(`✅ [${requestId}] Success in ${duration}ms`);
      
      return { success: true, duration, result };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.errors++;
      
      if (error.message.includes('timeout') || error.code === 'ECONNRESET') {
        this.results.timeouts++;
        console.log(`⏰ [${requestId}] Timeout after ${duration}ms: ${error.message}`);
      } else {
        console.log(`❌ [${requestId}] Error after ${duration}ms: ${error.message}`);
      }
      
      this.results.errorDetails.push({
        requestId,
        duration,
        error: error.message,
        question: question.substring(0, 100)
      });
      
      return { success: false, duration, error: error.message };
    } finally {
      this.results.total++;
    }
  }

  async runConcurrentTest(numRequests = 10, concurrency = 3) {
    console.log(`🧪 Starting stress test: ${numRequests} requests with concurrency ${concurrency}`);
    
    const questions = [
      "¿Cuál es la capital de Francia?",
      "Explica qué es la programación funcional en 100 palabras.",
      "¿Cómo funciona el algoritmo de ordenamiento quicksort?",
      "Describe las diferencias entre React y Vue.js.",
      "¿Qué es Docker y para qué se utiliza?",
      "Explica el concepto de machine learning en términos simples.",
      "¿Cuáles son las ventajas de usar TypeScript sobre JavaScript?",
      "Describe cómo funcionan las promesas en JavaScript.",
      "¿Qué es REST API y cuáles son sus principios?",
      "Explica el patrón de diseño MVC.",
      "¿Cómo se implementa autenticación JWT?",
      "Describe las diferencias entre SQL y NoSQL.",
      "¿Qué es el paradigma de programación orientada a objetos?",
      "Explica cómo funciona el protocolo HTTP.",
      "¿Cuáles son las mejores prácticas para seguridad web?"
    ];

    const requests = [];
    for (let i = 0; i < numRequests; i++) {
      const question = questions[i % questions.length];
      requests.push(this.singleRequest(i + 1, question));
    }

    // Ejecutar con concurrencia limitada
    const results = [];
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(batch);
      results.push(...batchResults);
      
      // Pequeña pausa entre lotes para no saturar
      if (i + concurrency < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  async runSequentialTest(numRequests = 5) {
    console.log(`🧪 Starting sequential test: ${numRequests} requests`);
    
    const complexQuestions = [
      "Analiza los pros y contras de diferentes arquitecturas de microservicios, incluyendo consideraciones de deployment, monitoreo y debugging.",
      "Explica detalladamente cómo implementar un sistema de cache distribuido usando Redis, incluyendo estrategias de invalidación y consistencia.",
      "Describe un pipeline completo de CI/CD moderno incluyendo testing automatizado, deployment strategies, rollback procedures y monitoring.",
      "Analiza las diferentes estrategias de manejo de estado en aplicaciones React grandes, comparando Context API, Redux, Zustand y otras alternativas.",
      "Explica cómo diseñar una base de datos escalable para una aplicación de e-commerce con millones de usuarios, incluyendo sharding, replicación y optimización de queries."
    ];

    const results = [];
    for (let i = 0; i < numRequests; i++) {
      const question = complexQuestions[i % complexQuestions.length];
      const result = await this.singleRequest(i + 1, question);
      results.push(result);
      
      // Pausa entre requests secuenciales
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return results;
  }

  printSummary() {
    console.log('\n📊 STRESS TEST SUMMARY');
    console.log('========================');
    console.log(`Total requests: ${this.results.total}`);
    console.log(`Successful: ${this.results.success} (${(this.results.success/this.results.total*100).toFixed(1)}%)`);
    console.log(`Errors: ${this.results.errors} (${(this.results.errors/this.results.total*100).toFixed(1)}%)`);
    console.log(`Timeouts: ${this.results.timeouts} (${(this.results.timeouts/this.results.total*100).toFixed(1)}%)`);
    
    if (this.results.durations.length > 0) {
      const sorted = this.results.durations.sort((a, b) => a - b);
      const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      
      console.log(`\nLatency stats:`);
      console.log(`  Average: ${avg.toFixed(0)}ms`);
      console.log(`  Median (P50): ${p50}ms`);
      console.log(`  P95: ${p95}ms`);
      console.log(`  P99: ${p99}ms`);
      console.log(`  Min: ${sorted[0]}ms`);
      console.log(`  Max: ${sorted[sorted.length-1]}ms`);
    }

    if (this.results.errorDetails.length > 0) {
      console.log(`\n❌ ERROR DETAILS:`);
      this.results.errorDetails.forEach(err => {
        console.log(`  [${err.requestId}] ${err.error} (${err.duration}ms)`);
        console.log(`    Question: "${err.question}..."`);
      });
    }
  }
}

async function main() {
  const tester = new MCPStressTest();
  
  try {
    // Test 1: Requests concurrentes moderados
    console.log('🎯 TEST 1: Concurrent requests (moderate load)');
    await tester.runConcurrentTest(15, 4);
    
    console.log('\n⏸️  Waiting 30 seconds between tests...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Test 2: Requests secuenciales con preguntas complejas
    console.log('\n🎯 TEST 2: Sequential complex requests');
    await tester.runSequentialTest(8);
    
    console.log('\n⏸️  Waiting 30 seconds between tests...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Test 3: Alta concurrencia
    console.log('\n🎯 TEST 3: High concurrency stress test');
    await tester.runConcurrentTest(20, 6);
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
  } finally {
    tester.printSummary();
  }
}

main();