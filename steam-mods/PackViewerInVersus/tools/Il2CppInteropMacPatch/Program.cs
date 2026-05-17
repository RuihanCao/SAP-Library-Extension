using Mono.Cecil;
using Mono.Cecil.Cil;

if (args.Length < 1 || args.Length > 2)
{
    Console.Error.WriteLine("Usage: Il2CppInteropMacPatch <Il2CppInterop.Runtime.dll> [module-name]");
    return 2;
}

var assemblyPath = Path.GetFullPath(args[0]);
var macProcessModuleName = args.Length == 2 ? args[1] : "Super Auto Pets";
if (!File.Exists(assemblyPath))
{
    Console.Error.WriteLine($"Assembly not found: {assemblyPath}");
    return 2;
}

var readerParameters = new ReaderParameters { ReadWrite = true };
var assembly = AssemblyDefinition.ReadAssembly(assemblyPath, readerParameters);
var replacements = 0;

foreach (var module in assembly.Modules)
foreach (var type in module.Types)
{
    PatchType(type, macProcessModuleName, ref replacements);
}

if (replacements == 0)
{
    Console.WriteLine("No InjectorHelpers module-name strings needed patching.");
    return 0;
}

assembly.Write();
Console.WriteLine($"Patched {replacements} InjectorHelpers module-name string(s) to '{macProcessModuleName}' in {assemblyPath}");
return 0;

static void PatchType(TypeDefinition type, string macProcessModuleName, ref int replacements)
{
    foreach (var method in type.Methods)
    {
        if (!method.HasBody)
        {
            continue;
        }

        foreach (var instruction in method.Body.Instructions)
        {
            if (instruction.OpCode != OpCodes.Ldstr || instruction.Operand is not string value)
            {
                continue;
            }

            if (value is "UserAssembly.dll" or "GameAssembly.dylib")
            {
                instruction.Operand = macProcessModuleName;
                replacements++;
            }
        }
    }

    foreach (var nested in type.NestedTypes)
    {
        PatchType(nested, macProcessModuleName, ref replacements);
    }
}
