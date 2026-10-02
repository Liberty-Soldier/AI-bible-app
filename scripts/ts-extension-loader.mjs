export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export%20default%20undefined",
      shortCircuit: true,
    };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (/^\.\.?\//.test(specifier) && !/\.[A-Za-z0-9]+$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }

    throw error;
  }
}
