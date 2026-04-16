/* =========================================
PrepOS Generator Core
Entry point for ALL generators
========================================= */

/* =========================================
PrepOS Generator Core
Entry point for ALL generators
========================================= */

import { MalayalamGenerator } from "./Generators/malayalam.js"
// English + Maths added later


/* ================================
Generator Registry
================================ */

const Generators = {

  malayalam: MalayalamGenerator

  // english: EnglishGenerator
  // maths: MathsGenerator

};


/* ================================
Main Entry Point
================================ */

export async function runGenerator(config) {

  const { subject } = config;

  const generator = Generators[subject];

  if (!generator) {
    throw new Error(
      "Generator not found: " + subject
    );
  }

  return generator.generate(config);

}