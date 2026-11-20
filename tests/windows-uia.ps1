# Windows acceptance test: exercise a normal app process via UI Automation, without DevTools.
param([string]$Executable)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = Split-Path -Parent $PSScriptRoot
$profileDir = (New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) "questlog-uia-$([guid]::NewGuid())")).FullName
$launchArgs = @("`"--user-data-dir=$profileDir`"")
if (!$Executable) {
    $Executable = Join-Path $root 'node_modules\electron\dist\electron.exe'
    $launchArgs = @('.') + $launchArgs
}
$descendants = [System.Windows.Automation.TreeScope]::Descendants
$ae = [System.Windows.Automation.AutomationElement]
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class QuestlogCapturePolicy {
    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool GetWindowDisplayAffinity(IntPtr window, out uint affinity);
}
'@
function Assert-CaptureProtection {
    [uint32]$affinity = 0
    if (![QuestlogCapturePolicy]::GetWindowDisplayAffinity([IntPtr]::new($window.Current.NativeWindowHandle), [ref]$affinity) -or
        $affinity -notin @(0x11, 0x01)) { throw "Windows did not report capture protection for the overlay (affinity $affinity)" }
}

function Wait-For($description, [scriptblock]$probe) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    do {
        try {
            $result = & $probe
            if ($result) { return $result }
        } catch [System.Windows.Automation.ElementNotAvailableException] {
            # The accessibility provider may replace a node between queries.
        }
        Start-Sleep -Milliseconds 80
    } while ($timer.Elapsed.TotalSeconds -lt 12)
    throw "UI Automation timed out: $description"
}
function Named($name) {
    [System.Windows.Automation.PropertyCondition]::new($ae::NameProperty, $name)
}
function Control($name, $type = $null) {
    $match = Named $name
    if ($type) {
        $match = [System.Windows.Automation.AndCondition]::new(
            $match, [System.Windows.Automation.PropertyCondition]::new($ae::ControlTypeProperty, $type))
    }
    Wait-For $name { $window.FindFirst($descendants, $match) }
}
function Invoke-Button($name) {
    $button = Control $name ([System.Windows.Automation.ControlType]::Button)
    $pattern = $null
    if ($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { $pattern.Invoke(); return }
    if ($button.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$pattern)) { $pattern.Toggle(); return }
    if ($button.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$pattern)) {
        if ($pattern.Current.ExpandCollapseState -eq 'Collapsed') { $pattern.Expand() } else { $pattern.Collapse() }
        return
    }
    throw "Button '$name' has no supported activation action"
}
function Editor($name) { Control $name ([System.Windows.Automation.ControlType]::Edit) }
function Read-FixtureJournal {
    # Allow the app to atomically replace the journal while this observer polls it.
    $stream = [IO.File]::Open((Join-Path $profileDir 'journal.json'), 'Open', 'Read', ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $reader = [IO.StreamReader]::new($stream)
    try { $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
}
function First-Editor($name) {
    Wait-For "first list item to contain '$name'" {
        $first = $window.FindFirst($descendants, (Named 'Item 1 of 2'))
        if ($first) { $first.FindFirst($descendants, (Named $name)) }
    }
}
function Text-Value($element) {
    $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
}
function Start-Fixture {
    $script:process = Start-Process -FilePath $Executable -ArgumentList $launchArgs -WorkingDirectory $root -PassThru
    $condition = [System.Windows.Automation.AndCondition]::new(
        [System.Windows.Automation.PropertyCondition]::new($ae::ProcessIdProperty, $process.Id), (Named 'QUESTS'))
    $script:window = Wait-For 'the test process window' {
        if ($process.HasExited) { throw "Test process exited with code $($process.ExitCode)" }
        $ae::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
    }
}
function Assert-TitleDrag {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class QuestlogHitTest {
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr hwnd, int index);
    [StructLayout(LayoutKind.Sequential)] struct Point { public int x, y; }
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr w, uint flags);
    public static IntPtr RootAt(int x, int y) {
        var old = SetThreadDpiAwarenessContext(new IntPtr(-4));
        try { return GetAncestor(WindowFromPoint(new Point { x=x, y=y }), 2); }
        finally { SetThreadDpiAwarenessContext(old); }
    }
    public static bool PassesClicks(int handle) { return (GetWindowLong(new IntPtr(handle), -20) & 0x20) != 0; }
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr w, uint msg, IntPtr wp, IntPtr lp, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point p);
    [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
    public static void DoubleClickBar(int handle, int x, int y) {
        var old = SetThreadDpiAwarenessContext(new IntPtr(-4));
        Point start; GetCursorPos(out start);
        try {
            // Do not search for a nearby ink pixel: the exact blank point must accept the double-click.
            if (RootAt(x,y) != new IntPtr(handle) || At(handle,x,y) != 1) throw new Exception("Header point is not hittable");
            SetCursorPos(x,y);
            System.Threading.Thread.Sleep(120);
            for (int i=0; i<2; ++i) {
                Point p; GetCursorPos(out p);
                if (p.x != x || p.y != y || RootAt(x,y) != new IntPtr(handle)) throw new Exception("Fixture lost the click target");
                mouse_event(2,0,0,0,UIntPtr.Zero); mouse_event(4,0,0,0,UIntPtr.Zero);
                System.Threading.Thread.Sleep(50);
            }
        } finally { SetCursorPos(start.x,start.y); SetThreadDpiAwarenessContext(old); }
    }
    public static int At(int handle, int x, int y) {
        var old = SetThreadDpiAwarenessContext(new IntPtr(-4));
        try {
            IntPtr hit;
            if (SendMessageTimeout(new IntPtr(handle), 0x84, IntPtr.Zero, new IntPtr(unchecked((y << 16) | (x & 65535))), 2, 1500, out hit) == IntPtr.Zero) throw new Exception("Hit test timed out");
            return hit.ToInt32();
        } finally { SetThreadDpiAwarenessContext(old); }
    }
}
'@
    $hwnd = $window.Current.NativeWindowHandle
    $add = (Control 'Settings').Current.BoundingRectangle
    $y = [int]($add.Top + $add.Height/2)
    if ([QuestlogHitTest]::At($hwnd,($add.Left + $add.Width/2),$y) -ne 1) { throw 'Header buttons must not initiate dragging' }
    $x = [int]($window.Current.BoundingRectangle.Left + 18)
    [QuestlogHitTest]::DoubleClickBar($hwnd,$x,$y)
    [void](Control 'Restore overlay' ([System.Windows.Automation.ControlType]::Button))
    [void](Control 'Timer time' ([System.Windows.Automation.ControlType]::Edit))
    Start-Sleep -Milliseconds 650
    [QuestlogHitTest]::DoubleClickBar($hwnd,($add.Left - 2),$y)
    [void](Control 'Minimize to header and timer' ([System.Windows.Automation.ControlType]::Button))
    Invoke-Button 'Settings'
    $slider = [System.Windows.Automation.ControlType]::Slider
    $idle = (Control 'Idle opacity' $slider).GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
    $hover = (Control 'Hover opacity' $slider).GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
    $oldIdle = $idle.Current.Value
    $oldHover = $hover.Current.Value
    $idle.SetValue(0); $hover.SetValue(0)
    Invoke-Button 'Done'
    Start-Sleep -Milliseconds 650
    [QuestlogHitTest]::DoubleClickBar($hwnd,($add.Left - 3),$y)
    [void](Control 'Restore overlay' ([System.Windows.Automation.ControlType]::Button))
    Invoke-Button 'Restore overlay'
    Invoke-Button 'Settings'
    (Control 'Hover opacity' $slider).GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern).SetValue($oldHover)
    (Control 'Idle opacity' $slider).GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern).SetValue($oldIdle)
    Invoke-Button 'Done'
}
function Stop-Fixture {
    if ($process -and !$process.HasExited) {
        if (!$process.CloseMainWindow() -or !$process.WaitForExit(5000)) {
            Stop-Process -Id $process.Id -ErrorAction Stop
            [void]$process.WaitForExit(5000)
        }
    }
}

try {
    Start-Fixture
    [void](Wait-For 'the disposable journal' { Test-Path -LiteralPath (Join-Path $profileDir 'journal.json') })
    [void](Editor 'New item')
    Assert-CaptureProtection
    Assert-TitleDrag
    Invoke-Button 'Settings'
    [void](Control 'Idle opacity' ([System.Windows.Automation.ControlType]::Slider))
    [void](Control 'Hover opacity' ([System.Windows.Automation.ControlType]::Slider))
    Invoke-Button 'Done'
    [void](Control 'Timer progress' ([System.Windows.Automation.ControlType]::ProgressBar))
    (Text-Value (Editor 'Timer time')).SetValue('2:00')
    Invoke-Button 'Start timer'
    Invoke-Button 'Stop timer'
    [void](Control 'Start timer' ([System.Windows.Automation.ControlType]::Button))
    $initial = Editor 'New item'
    (Text-Value $initial).SetValue('Mark the map')
    # UIA actions are asynchronous; wait for the first editor to leave its draft state.
    [void](Editor 'Item: Mark the map')
    $first = Editor 'Item: Mark the map'
    $first.SetFocus()
    Add-Type -AssemblyName System.Windows.Forms
    if (!$first.Current.HasKeyboardFocus) { throw 'Fixture editor did not receive focus' }
    [System.Windows.Forms.SendKeys]::SendWait('{END}{ENTER}')
    $second = Editor 'New item'
    if ($initial.Current.AutomationId -eq $second.Current.AutomationId) { throw 'Enter did not create a distinct editor' }
    (Text-Value $second).SetValue('Pack the lamp')
    $id = (Control 'Item: Pack the lamp').Current.AutomationId
    if (!$id.StartsWith('text-')) { throw 'Item editor did not expose its stable automation ID' }
    $toggle = [System.Windows.Automation.TogglePattern]::Pattern
    (Control 'Complete: Pack the lamp').GetCurrentPattern($toggle).Toggle()
    [void](Wait-For 'checked state before reordering' { (Control 'Complete: Pack the lamp').GetCurrentPattern($toggle).Current.ToggleState -eq 'On' })
    $position = Control 'Reorder: Pack the lamp' ([System.Windows.Automation.ControlType]::Slider)
    $file = Join-Path $profileDir 'journal.json'
    $reader = [IO.File]::Open($file, 'Open', 'Read', [IO.FileShare]::ReadWrite)
    try {
        $position.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern).SetValue(1)
        [void](First-Editor 'Item: Pack the lamp')
        [void](Wait-For 'reordered journal staged during a temporary Windows sharing lock' { Test-Path -LiteralPath "$file.tmp" })
    } finally { $reader.Dispose() }
    [void](Wait-For 'order saved without needing a further edit' { (Read-FixtureJournal).items[0].text -eq 'Pack the lamp' })
    (Text-Value (Control 'Item: Pack the lamp')).SetValue('Pack the lantern')
    [void](Control 'Reorder: Pack the lantern' ([System.Windows.Automation.ControlType]::Slider))
    Invoke-Button 'Settings'
    (Control 'Show notepad' ([System.Windows.Automation.ControlType]::CheckBox)).GetCurrentPattern($toggle).Toggle()
    (Text-Value (Editor 'Notepad')).SetValue('Meet at the trailhead.')
    [void](Wait-For 'edited notepad value' { (Text-Value (Editor 'Notepad')).Current.Value -eq 'Meet at the trailhead.' })
    [void](Wait-For 'saved notes and order' {
        $saved = Read-FixtureJournal
        $saved.notes -eq 'Meet at the trailhead.' -and $saved.items[0].text -eq 'Pack the lantern' -and $saved.items[0].done
    })
    Stop-Fixture
    Start-Fixture
    $again = First-Editor 'Item: Pack the lantern'
    if ($again.Current.AutomationId -ne $id -or (Text-Value $again).Current.Value -ne 'Pack the lantern') { throw 'Item identity or text changed' }
    if ((Control 'Complete: Pack the lantern').GetCurrentPattern($toggle).Current.ToggleState -ne 'On') { throw 'Checkmark not preserved' }
    $position = (Control 'Reorder: Pack the lantern' ([System.Windows.Automation.ControlType]::Slider)).GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
    if ($position.Current.Value -ne 1 -or $position.Current.Minimum -ne 1) { throw 'Position not preserved' }
    if ((Text-Value (Editor 'Notepad')).Current.Value -ne 'Meet at the trailhead.') { throw 'Notepad did not persist' }
    Invoke-Button 'Lock overlay'
    [void](Wait-For 'locked checklist remains readable but not editable' {
        (Text-Value (Control 'Item: Pack the lantern')).Current.IsReadOnly -and !(Control 'Complete: Pack the lantern').Current.IsEnabled
    })
    Assert-CaptureProtection
    if (![QuestlogHitTest]::PassesClicks($window.Current.NativeWindowHandle)) { throw 'Locked journal still intercepts mouse input' }
    $lockRect = (Control 'Unlock overlay').Current.BoundingRectangle
    $unlock = Wait-For 'visible native unlock button' {
        $at = [QuestlogHitTest]::RootAt(($lockRect.Left + $lockRect.Width / 2), ($lockRect.Top + $lockRect.Height / 2))
        if ($at -ne [IntPtr]::Zero -and $at.ToInt32() -ne $window.Current.NativeWindowHandle) {
            $hitWindow = $ae::FromHandle($at)
            if ($hitWindow.Current.ProcessId -eq $process.Id) { $hitWindow.FindFirst($descendants, (Named 'Unlock overlay')) }
        }
    }
    $unlock.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    [void](Wait-For 'clickable padlock restores editing' { !(Text-Value (Editor 'Item: Pack the lantern')).Current.IsReadOnly })
    Write-Output 'Windows UI Automation: add, edit, check, reorder, notes, restart and read-only lock passed.'
} catch {
    $file = Join-Path $profileDir 'journal.json'
    if (Test-Path -LiteralPath $file) {
        $fixture = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
        Write-Output ("Disposable fixture at failure: " + (@{items=$fixture.items; notes=$fixture.notes; notesOpen=$fixture.notesOpen} | ConvertTo-Json -Compress -Depth 4))
        if (Test-Path -LiteralPath "$file.tmp") { Write-Output 'There is a pending atomic write.' }
        if ($window) {
            $alert = $window.FindFirst($descendants, [System.Windows.Automation.PropertyCondition]::new($ae::AutomationIdProperty, 'notice'))
            if ($alert) { Write-Output ("Save notice: " + $alert.Current.Name) }
        }
    }
    throw
} finally {
    Stop-Fixture
    Remove-Item -LiteralPath $profileDir -Recurse -Force
}
