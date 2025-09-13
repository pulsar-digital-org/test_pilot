When generating tests, we don't have the proper imports, this needs to be addressed since for example if we are importing `node:fs`,
we need to include this in the context, because the model with try to import from for this example `fs`

This should be fixed in the analysis module when we are going to be tracing the calls, we should also include these imports
